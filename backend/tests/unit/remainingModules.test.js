// Service-level tests for the last modules that had none: search, content, liveSelling, maintenance,
// serviceCategory, deliveryBusiness (roster and job ownership) and businessTools.
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/search/search.repository");
jest.mock("../../src/utils/cache", () => ({ getOrSet: jest.fn((ns, key, fn) => fn()) }));
jest.mock("../../src/modules/content/content.repository");
jest.mock("../../src/modules/liveSelling/liveSelling.repository");
jest.mock("../../src/modules/notification/notification.service");
jest.mock("../../src/modules/maintenance/maintenance.repository");
jest.mock("../../src/modules/category/category.repository");
jest.mock("../../src/modules/serviceCategory/serviceCategory.repository");
jest.mock("../../src/utils/cloudinaryUpload", () => ({ uploadToCloudinary: jest.fn() }));
jest.mock("../../src/modules/deliveryBusiness/deliveryBusiness.repository");
jest.mock("../../src/modules/delivery/delivery.repository");
jest.mock("../../src/modules/auth/auth.repository");
jest.mock("../../src/utils/privateDocuments", () => ({ uploadPrivateDocument: jest.fn() }));

const db = require("../../src/config/db");
const searchRepository = require("../../src/modules/search/search.repository");
const cache = require("../../src/utils/cache");
const contentRepository = require("../../src/modules/content/content.repository");
const liveRepository = require("../../src/modules/liveSelling/liveSelling.repository");
const notificationService = require("../../src/modules/notification/notification.service");
const maintenanceRepository = require("../../src/modules/maintenance/maintenance.repository");
const categoryRepository = require("../../src/modules/category/category.repository");
const serviceCategoryRepository = require("../../src/modules/serviceCategory/serviceCategory.repository");
const bizRepo = require("../../src/modules/deliveryBusiness/deliveryBusiness.repository");
const authRepository = require("../../src/modules/auth/auth.repository");
const { uploadPrivateDocument } = require("../../src/utils/privateDocuments");

const search = require("../../src/modules/search/search.service");
const content = require("../../src/modules/content/content.service");
const live = require("../../src/modules/liveSelling/liveSelling.service");
const serviceCategories = require("../../src/modules/serviceCategory/serviceCategory.service");
const business = require("../../src/modules/deliveryBusiness/deliveryBusiness.service");
const businessTools = require("../../src/modules/businessTools/businessTools.service");
let maintenance;

beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => { maintenance = require("../../src/modules/maintenance/maintenance.service"); });
    notificationService.notify.mockResolvedValue();
});

describe("search", () => {
    it("ignores terms under 2 characters and trims and caps long ones", async () => {
        await search.logQuery(" a ");
        await search.logQuery("");
        await search.logQuery(undefined);
        expect(searchRepository.logQuery).not.toHaveBeenCalled();
        await search.logQuery("  Soap  ");
        expect(searchRepository.logQuery).toHaveBeenCalledWith("Soap", "soap");
        await search.logQuery("x".repeat(500));
        expect(searchRepository.logQuery.mock.calls[1][0]).toHaveLength(100);
    });
    it("trending returns the normalized terms, via the cache", async () => {
        searchRepository.findTrending.mockResolvedValue([{ normalized_term: "soap" }, { normalized_term: "rice" }]);
        await expect(search.getTrending()).resolves.toEqual(["soap", "rice"]);
        expect(cache.getOrSet).toHaveBeenCalled();
    });
});

describe("content", () => {
    it("requires a title and a body", async () => {
        await expect(content.create(1, { title: "", bodyMarkdown: "x" })).rejects.toThrow("required");
        await expect(content.create(1, { title: "T", bodyMarkdown: "" })).rejects.toThrow("required");
    });
    it("makes the slug unique by suffixing", async () => {
        contentRepository.findSlug.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 }).mockResolvedValue(undefined);
        contentRepository.create.mockResolvedValue(9);
        contentRepository.findById.mockResolvedValue({ id: 9 });
        await content.create(1, { title: "Buying Guide", bodyMarkdown: "b" });
        expect(contentRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: "buying-guide-3", authorId: 1 }));
    });
    it("accepts only draft or published as a status, and updating a missing article fails", async () => {
        await expect(content.setStatus(1, "archived")).rejects.toThrow("Invalid status");
        expect(contentRepository.setStatus).not.toHaveBeenCalled();
        contentRepository.findById.mockResolvedValue(undefined);
        await expect(content.update(1, {})).rejects.toThrow("Article not found");
    });
});

describe("liveSelling", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const base = { title: "Sale", externalLink: "https://www.youtube.com/watch?v=abc", scheduledAt: future };
    it("requires title, link and time", async () => {
        await expect(live.create(1, { ...base, title: "" })).rejects.toThrow("required");
    });
    it("rejects unsafe links and past times", async () => {
        await expect(live.create(1, { ...base, externalLink: "javascript:alert(1)" })).rejects.toThrow("https link");
        await expect(live.create(1, { ...base, externalLink: "http://youtube.com/x" })).rejects.toThrow("https link");
        await expect(live.create(1, { ...base, scheduledAt: new Date(Date.now() - 1000).toISOString() })).rejects.toThrow("future");
        expect(liveRepository.create).not.toHaveBeenCalled();
    });
    it("only the owning seller can change a session's status", async () => {
        liveRepository.findById.mockResolvedValue({ id: 4, seller_id: 1, title: "Sale", store_name: "S" });
        await expect(live.setStatus(4, 2, "live")).rejects.toThrow("Session not found");
        expect(liveRepository.setStatus).not.toHaveBeenCalled();
        await expect(live.setStatus(4, 1, "bogus")).rejects.toThrow("Invalid status");
    });
    it("going live notifies subscribers once and marks them notified", async () => {
        liveRepository.findById.mockResolvedValue({ id: 4, seller_id: 1, title: "Sale", store_name: "S" });
        liveRepository.findPendingReminders.mockResolvedValue([{ id: 11, user_id: 7 }, { id: 12, user_id: 8 }]);
        await live.setStatus(4, 1, "live");
        await new Promise((r) => setImmediate(r));
        expect(notificationService.notify).toHaveBeenCalledTimes(2);
        expect(liveRepository.markRemindersNotified).toHaveBeenCalledWith([11, 12]);
    });
    it("a reminder can only be set on a scheduled session", async () => {
        liveRepository.findById.mockResolvedValue({ id: 4, status: "ended" });
        await expect(live.subscribeReminder(7, 4)).rejects.toThrow("no longer scheduled");
        liveRepository.findById.mockResolvedValue(undefined);
        await expect(live.subscribeReminder(7, 4)).rejects.toThrow("Session not found");
    });
});

describe("maintenance", () => {
    it("an unknown module key fails open (counts as active)", async () => {
        maintenanceRepository.findAll.mockResolvedValue([{ module_key: "wallet", is_active: 0, maintenance_message: "Back soon" }]);
        await expect(maintenance.getModuleStatus("typo")).resolves.toEqual({ isActive: true, message: null });
        await expect(maintenance.getModuleStatus("wallet")).resolves.toEqual({ isActive: false, message: "Back soon" });
    });
    it("a toggle is live on the very next read (cache invalidated)", async () => {
        maintenanceRepository.findAll.mockResolvedValueOnce([{ module_key: "wallet", is_active: 1 }]).mockResolvedValue([{ module_key: "wallet", is_active: 0, maintenance_message: "m" }]);
        maintenanceRepository.findByKey.mockResolvedValue({ module_key: "wallet" });
        expect((await maintenance.getModuleStatus("wallet")).isActive).toBe(true);
        await maintenance.setModuleActive("wallet", false, "m", 1);
        expect((await maintenance.getModuleStatus("wallet")).isActive).toBe(false);
    });
    it("refuses to toggle an unknown module", async () => {
        maintenanceRepository.findByKey.mockResolvedValue(undefined);
        await expect(maintenance.setModuleActive("nope", false, "", 1)).rejects.toThrow("Unknown module");
        expect(maintenanceRepository.setActive).not.toHaveBeenCalled();
    });
    it("the overview merges departments, services and modules", async () => {
        categoryRepository.findAllForAdmin.mockResolvedValue([{ id: 1, name: "D", slug: "d", is_active: 1, status: "active" }]);
        serviceCategoryRepository.findAllForAdmin.mockResolvedValue([{ id: 2, name: "S", slug: "s", is_active: 0, status: "maintenance" }]);
        maintenanceRepository.findAll.mockResolvedValue([{ id: 3, module_key: "wallet", name: "Wallet", is_active: 1 }]);
        const overview = await maintenance.getOverview();
        expect(overview.departments[0]).toMatchObject({ type: "department", is_active: true });
        expect(overview.services[0]).toMatchObject({ type: "service", is_active: false });
        expect(overview.modules[0]).toMatchObject({ type: "module", key: "wallet" });
    });
});

describe("serviceCategory", () => {
    it("a deactivated category is hidden; one in maintenance throws a flagged error", async () => {
        serviceCategoryRepository.findBySlug.mockResolvedValueOnce({ id: 1, status: "deactivated" });
        await expect(serviceCategories.getBySlug("x")).resolves.toBeNull();
        serviceCategoryRepository.findBySlug.mockResolvedValueOnce({ id: 1, name: "Cleaning", status: "maintenance", maintenance_message: "Back Friday" });
        await expect(serviceCategories.getBySlug("x")).rejects.toMatchObject({ isMaintenance: true, message: "Back Friday" });
    });
    it("an active category carries its service count", async () => {
        serviceCategoryRepository.findBySlug.mockResolvedValue({ id: 1, status: "active" });
        serviceCategoryRepository.countServicesByCategory.mockResolvedValue(6);
        await expect(serviceCategories.getBySlug("x")).resolves.toMatchObject({ serviceCount: 6 });
    });
    it("refuses duplicate names and missing categories", async () => {
        serviceCategoryRepository.findBySlug.mockResolvedValue({ id: 1 });
        await expect(serviceCategories.createCategory("Cleaning")).rejects.toThrow("already exists");
        serviceCategoryRepository.findById.mockResolvedValue(undefined);
        await expect(serviceCategories.updateCategory(5, "X")).rejects.toThrow("not found");
        await expect(serviceCategories.deactivateCategory(5)).rejects.toThrow("not found");
        await expect(serviceCategories.setCategoryActive(5, false, "m")).rejects.toThrow("not found");
    });
});

describe("deliveryBusiness", () => {
    const biz = { id: 1, owner_user_id: 10 };
    it("a business name is required, and a rostered agent cannot also own a business", async () => {
        await expect(business.register(10, "  ")).rejects.toThrow("name is required");
        bizRepo.findMembershipByAgent.mockResolvedValue({ business_id: 2 });
        await expect(business.register(10, "Fast")).rejects.toThrow("roster");
        expect(bizRepo.create).not.toHaveBeenCalled();
    });
    it("only an approved delivery agent who is free can join a roster", async () => {
        bizRepo.findUserByEmail.mockResolvedValueOnce({ id: 20, role: "buyer" });
        await expect(business.addAgent(biz, "a@x.tz")).rejects.toThrow("isn't registered as a delivery agent");
        bizRepo.findUserByEmail.mockResolvedValueOnce({ id: 20, role: "delivery_agent", account_verification_status: "pending" });
        await expect(business.addAgent(biz, "a@x.tz")).rejects.toThrow("hasn't been approved");
        bizRepo.findUserByEmail.mockResolvedValueOnce({ id: 10, role: "delivery_agent", account_verification_status: "approved" });
        await expect(business.addAgent(biz, "a@x.tz")).rejects.toThrow("yourself");
        bizRepo.findUserByEmail.mockResolvedValue({ id: 20, role: "delivery_agent", account_verification_status: "approved" });
        bizRepo.findByOwner.mockResolvedValue(undefined);
        bizRepo.countRoster.mockResolvedValue(0);
        bizRepo.findMembershipByAgent.mockResolvedValue({ business_id: 2 });
        await expect(business.addAgent(biz, "a@x.tz")).rejects.toThrow("another delivery business");
        expect(bizRepo.addAgent).not.toHaveBeenCalled();
    });
    it("an agent cannot be removed while they have open jobs, nor one who is not on this roster", async () => {
        bizRepo.countOpenJobsForAgent.mockResolvedValueOnce(2);
        await expect(business.removeAgent(biz, 20)).rejects.toThrow("open jobs");
        bizRepo.countOpenJobsForAgent.mockResolvedValue(0);
        bizRepo.removeAgent.mockResolvedValue(0);
        await expect(business.removeAgent(biz, 20)).rejects.toMatchObject({ statusCode: 404 });
    });
    it("a job of another business is 'not found' (the lock is scoped to the business id)", async () => {
        bizRepo.lockJob.mockResolvedValue(undefined);
        await expect(business.assignJob(biz, 99, 20)).rejects.toMatchObject({ statusCode: 404 });
        await expect(business.updateJobStatus(biz, 99, "cancelled")).rejects.toMatchObject({ statusCode: 404 });
        expect(bizRepo.lockJob).toHaveBeenCalledWith(expect.anything(), 1, 99);
        expect(db.__mockConnection.rollback).toHaveBeenCalled();
    });
    it("a job can only be assigned to an agent on this roster and only before pickup", async () => {
        bizRepo.lockJob.mockResolvedValue({ id: 5, status: "picked_up" });
        await expect(business.assignJob(biz, 5, 20)).rejects.toThrow("haven't been picked up");
        bizRepo.lockJob.mockResolvedValue({ id: 5, status: "created" });
        bizRepo.isRosterMember.mockResolvedValue(false);
        await expect(business.assignJob(biz, 5, 20)).rejects.toThrow("isn't on your roster");
        expect(bizRepo.updateJob).not.toHaveBeenCalled();
    });
    it("status changes follow the allowed transitions only", async () => {
        bizRepo.lockJob.mockResolvedValue({ id: 5, status: "created" });
        await expect(business.updateJobStatus(biz, 5, "delivered")).rejects.toThrow("can't be marked");
        bizRepo.lockJob.mockResolvedValue({ id: 5, status: "delivered" });
        await expect(business.updateJobStatus(biz, 5, "cancelled")).rejects.toThrow("can't be marked");
    });
    it("a negative job fee is refused", async () => {
        await expect(business.createJob(biz, { feeAmount: -5 })).rejects.toThrow("Fee must be zero or more");
        expect(bizRepo.insertJob).not.toHaveBeenCalled();
    });
});

describe("businessTools.convertToMarketplace", () => {
    const files = { owner_photo: [{ buffer: Buffer.from("a") }], national_id: [{ buffer: Buffer.from("b") }] };
    it("only a business-tools seller can convert", async () => {
        authRepository.findById.mockResolvedValue({ id: 1, role: "buyer" });
        await expect(businessTools.convertToMarketplace(1, files)).rejects.toThrow("Only a business tools account");
        authRepository.findById.mockResolvedValue({ id: 1, role: "seller", seller_mode: "marketplace" });
        await expect(businessTools.convertToMarketplace(1, files)).rejects.toThrow("Only a business tools account");
        expect(uploadPrivateDocument).not.toHaveBeenCalled();
    });
    it("needs an owner photo and one ID document before anything is uploaded", async () => {
        authRepository.findById.mockResolvedValue({ id: 1, role: "seller", seller_mode: "business_tools" });
        await expect(businessTools.convertToMarketplace(1, { national_id: files.national_id })).rejects.toThrow("owner photo");
        await expect(businessTools.convertToMarketplace(1, { owner_photo: files.owner_photo })).rejects.toThrow("national_id or voter_id");
        expect(uploadPrivateDocument).not.toHaveBeenCalled();
    });
    it("a failed upload changes nothing in the database", async () => {
        authRepository.findById.mockResolvedValue({ id: 1, role: "seller", seller_mode: "business_tools" });
        uploadPrivateDocument.mockRejectedValue(new Error("cloud down"));
        await expect(businessTools.convertToMarketplace(1, files)).rejects.toThrow("couldn't upload");
        expect(db.getConnection).not.toHaveBeenCalled();
    });
    it("a double submit is refused and rolled back", async () => {
        authRepository.findById.mockResolvedValue({ id: 1, role: "seller", seller_mode: "business_tools" });
        uploadPrivateDocument.mockResolvedValue({ public_id: "p" });
        db.__mockConnection.query.mockResolvedValue([{ affectedRows: 0 }]);
        await expect(businessTools.convertToMarketplace(1, files)).rejects.toThrow("already been upgraded");
        expect(db.__mockConnection.rollback).toHaveBeenCalled();
        expect(authRepository.insertVerificationDocument).not.toHaveBeenCalled();
    });
    it("a valid conversion stores both documents and the history entry in one transaction", async () => {
        authRepository.findById.mockResolvedValue({ id: 1, role: "seller", seller_mode: "business_tools", password: "hash" });
        uploadPrivateDocument.mockResolvedValue({ public_id: "p" });
        db.__mockConnection.query.mockResolvedValue([{ affectedRows: 1 }]);
        const result = await businessTools.convertToMarketplace(1, files);
        expect(authRepository.insertVerificationDocument).toHaveBeenCalledTimes(2);
        expect(authRepository.insertVerificationHistory).toHaveBeenCalledWith(1, "submitted", null, null, db.__mockConnection);
        expect(db.__mockConnection.commit).toHaveBeenCalled();
        expect(result.password).toBeUndefined();
    });
});
