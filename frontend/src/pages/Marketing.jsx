import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta";
import Breadcrumbs from "../components/ui/Breadcrumbs";
import { useLanguage } from "../context/LanguageContext";
import { SITE_URL, SITE_NAME, buildBreadcrumbJsonLd } from "../utils/seo";

// Public company/marketing pages that were missing from the site: Sell,
// How it works, About, Contact. Copy lives in LanguageContext (English +
// Swahili); contact details are the ones already published on
// /legal/company-information.
const SUPPORT_EMAIL = "amgerryofficial@gmail.com";
const SUPPORT_PHONE = "+255622387905";
const REGISTERED_ADDRESS = "Dar es Salaam, Tanzania";

function Shell({ path, titleKey, descriptionKey, headingKey, introKey, schemaType, extraJsonLd, children }) {
    const { t } = useLanguage();
    const crumbs = [{ label: t("marketing.home"), href: "/" }, { label: t(titleKey) }];
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
            <PageMeta
                title={t(titleKey)}
                description={t(descriptionKey)}
                jsonLd={[
                    {
                        "@context": "https://schema.org",
                        "@type": schemaType,
                        name: t(titleKey),
                        description: t(descriptionKey),
                        url: `${SITE_URL}${path}`,
                        isPartOf: { "@id": `${SITE_URL}/#website` },
                        ...(extraJsonLd || {})
                    },
                    buildBreadcrumbJsonLd(crumbs, path)
                ]}
            />
            <Breadcrumbs items={crumbs} />
            <h1 className="font-display text-3xl mb-3">{t(headingKey)}</h1>
            {introKey && <p className="text-ash mb-8">{t(introKey)}</p>}
            {children}
        </div>
    );
}

function Steps({ prefix, count = 4 }) {
    const { t } = useLanguage();
    return (
        <ol className="space-y-5 mb-8">
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
                <li key={n} className="flex gap-4">
                    <span className="shrink-0 w-8 h-8 rounded-full bg-teal/10 text-teal flex items-center justify-center text-sm font-medium">{n}</span>
                    <div>
                        <h2 className="font-medium">{t(`${prefix}.step${n}.title`)}</h2>
                        <p className="text-sm text-ash mt-0.5">{t(`${prefix}.step${n}.body`)}</p>
                    </div>
                </li>
            ))}
        </ol>
    );
}

export function SellOnNexora() {
    const { t } = useLanguage();
    return (
        <Shell path="/sell" titleKey="marketing.sell.title" descriptionKey="marketing.sell.description" headingKey="marketing.sell.heading" introKey="marketing.sell.intro" schemaType="WebPage">
            <Steps prefix="marketing.sell" />
            <div className="flex flex-wrap items-center gap-4">
                <Link to="/register" className="inline-block px-5 py-2.5 rounded-md bg-ink text-paper text-sm">{t("marketing.sell.cta")}</Link>
                <Link to="/legal/vendor-agreement" className="text-sm text-teal hover:underline">{t("marketing.sell.legal")}</Link>
            </div>
        </Shell>
    );
}

export function HowItWorks() {
    const { t } = useLanguage();
    return (
        <Shell path="/how-it-works" titleKey="marketing.how.title" descriptionKey="marketing.how.description" headingKey="marketing.how.heading" introKey="marketing.how.intro" schemaType="WebPage">
            <Steps prefix="marketing.how" />
            <Link to="/products" className="inline-block px-5 py-2.5 rounded-md bg-ink text-paper text-sm">{t("marketing.how.cta")}</Link>
        </Shell>
    );
}

export function About() {
    const { t } = useLanguage();
    return (
        <Shell path="/about" titleKey="marketing.about.title" descriptionKey="marketing.about.description" headingKey="marketing.about.heading" schemaType="AboutPage" extraJsonLd={{ about: { "@id": `${SITE_URL}/#organization` } }}>
            <p className="mb-4">{t("marketing.about.body1")}</p>
            <p className="mb-8 text-ash">{t("marketing.about.body2")}</p>
            <Link to="/legal/company-information" className="text-sm text-teal hover:underline">{t("marketing.about.company")}</Link>
        </Shell>
    );
}

export function Contact() {
    const { t } = useLanguage();
    return (
        <Shell
            path="/contact"
            titleKey="marketing.contact.title"
            descriptionKey="marketing.contact.description"
            headingKey="marketing.contact.heading"
            introKey="marketing.contact.intro"
            schemaType="ContactPage"
            extraJsonLd={{
                mainEntity: {
                    "@type": "Organization",
                    name: SITE_NAME,
                    url: SITE_URL,
                    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, telephone: SUPPORT_PHONE }
                }
            }}
        >
            <dl className="space-y-4 text-sm">
                <div>
                    <dt className="text-ash">{t("marketing.contact.email")}</dt>
                    <dd><a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal hover:underline">{SUPPORT_EMAIL}</a></dd>
                </div>
                <div>
                    <dt className="text-ash">{t("marketing.contact.phone")}</dt>
                    <dd><a href={`tel:${SUPPORT_PHONE}`} className="text-teal hover:underline">{SUPPORT_PHONE}</a></dd>
                </div>
                <div>
                    <dt className="text-ash">{t("marketing.contact.address")}</dt>
                    <dd>{REGISTERED_ADDRESS}</dd>
                </div>
            </dl>
        </Shell>
    );
}
