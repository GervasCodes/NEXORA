# Software Requirements Specification (SRS)

# NEXORA

## 1. Introduction

### 1.1 Purpose

The purpose of this document is to define the software requirements for NEXORA, a regional multi-vendor e-commerce platform designed to connect buyers, sellers, and delivery service providers. This document serves as a guide for the design, development, testing, deployment, and maintenance of the system.

### 1.2 Scope

NEXORA is a web-based e-commerce platform that enables buyers to search for products, communicate with sellers, place orders, make secure payments, and track deliveries. Sellers can manage their stores, upload products with multiple images and videos, process customer orders, and monitor sales performance. Delivery agents are responsible for handling product deliveries, while administrators oversee the entire platform, including user management, seller verification, and system monitoring.

### 1.3 Objectives

The objectives of NEXORA are to:

* Provide a secure online marketplace for buyers and sellers.
* Enable sellers to manage products and orders efficiently.
* Integrate delivery services within the platform.
* Improve trust through seller verification, product reviews, and ratings.
* Provide secure authentication and role-based access control.
* Support scalable and maintainable system architecture.
* Enhance the online shopping experience through modern technologies.

### 1.4 Intended Users

The primary users of NEXORA include:

* Buyers
* Sellers
* Delivery Agents
* System Administrators

Each user category has specific permissions and responsibilities within the platform.

### 1.5 Technologies

The system will be developed using the following technologies:

* React.js
* Tailwind CSS
* Node.js
* Express.js
* MySQL
* JSON Web Token (JWT)
* Cloudinary
* Nodemailer
* Git and GitHub

### 1.6 Assumptions

The development of NEXORA assumes that users have internet access, compatible web browsers, and valid credentials to access the system. It is also assumed that third-party services such as Cloudinary and email services are available during system operation.

### 1.7 Constraints

The first version of NEXORA will focus on web-based access only. Mobile applications are outside the scope of this version. The system also depends on internet connectivity and the availability of external services such as Cloudinary and email providers.

## 2. Functional Requirements

The following functional requirements define the services and functionalities that shall be provided by the NEXORA system.

### 2.1 User Management

The system shall:

* Allow users to register as Buyers, Sellers, or Delivery Agents.
* Allow users to log in securely.
* Allow users to log out.
* Allow users to reset forgotten passwords.
* Verify user email addresses.
* Allow users to update their profile information.
* Allow users to upload profile pictures.
* Allow administrators to manage user accounts.

---

### 2.2 Seller Management

The system shall:

* Allow sellers to create stores.
* Allow sellers to edit store information.
* Allow sellers to upload store logos.
* Allow administrators to verify seller accounts.
* Display seller verification badges.

---

### 2.3 Product Management

The system shall:

* Allow sellers to add products.
* Allow sellers to edit products.
* Allow sellers to delete products.
* Allow sellers to upload multiple product images.
* Allow sellers to upload product videos.
* Organize products into categories.
* Display product availability.
* Allow administrators to remove inappropriate products.

---

### 2.4 Product Search

The system shall:

* Allow buyers to search products.
* Filter products by category.
* Filter by price.
* Filter by location.
* Sort products by popularity, newest, and price.

---

### 2.5 Shopping Cart

The system shall:

* Allow buyers to add items to the shopping cart.
* Update cart quantities.
* Remove products from the cart.
* Display cart totals.

---

### 2.6 Wishlist

The system shall:

* Allow buyers to save products.
* Remove saved products.
* View wishlist items.

---

### 2.7 Order Management

The system shall:

* Allow buyers to place orders.
* Generate order numbers.
* Display order history.
* Allow buyers to cancel eligible orders.
* Allow sellers to accept or reject orders.
* Update order status automatically.

---

### 2.8 Payment Management

The system shall:

* Support Mobile Money payments.
* Support Cash on Delivery.
* Record payment transactions.
* Generate payment receipts.

---

### 2.9 Delivery Management

The system shall:

* Assign deliveries to delivery agents.
* Track delivery progress.
* Notify buyers about delivery updates.
* Confirm successful deliveries.

---

### 2.10 Communication

The system shall:

* Allow buyers and sellers to exchange messages.
* Send email notifications.
* Display in-system notifications.

---

### 2.11 Reviews and Ratings

The system shall:

* Allow buyers to review purchased products.
* Allow buyers to rate sellers.
* Display ratings publicly.

---

### 2.12 Reporting

The system shall:

* Generate sales reports.
* Generate order reports.
* Generate delivery reports.
* Generate user activity reports.

---

### 2.13 Administration

The system shall:

* Manage users.
* Manage products.
* Manage categories.
* Monitor transactions.
* Handle complaints.
* View system analytics.


## 3. Non-Functional Requirements

The following non-functional requirements define the quality attributes that the NEXORA system shall satisfy.

### 3.1 Performance

The system shall:

* Load pages within three (3) seconds under normal network conditions.
* Support multiple users accessing the system simultaneously.
* Process product searches efficiently.
* Handle large numbers of products without significant performance degradation.

---

### 3.2 Security

The system shall:

* Encrypt user passwords before storing them in the database.
* Use JSON Web Tokens (JWT) for authentication.
* Restrict access based on user roles.
* Validate all user inputs.
* Protect against SQL Injection attacks.
* Protect against Cross-Site Scripting (XSS).
* Protect against Cross-Site Request Forgery (CSRF) where applicable.
* Maintain secure communication using HTTPS in the production environment.

---

### 3.3 Reliability

The system shall:

* Operate continuously with minimal downtime.
* Recover gracefully from unexpected errors.
* Preserve user data during failures whenever possible.

---

### 3.4 Availability

The system shall:

* Be available 24 hours a day, subject to scheduled maintenance.
* Allow users to access services whenever an internet connection is available.

---

### 3.5 Scalability

The system shall:

* Support increasing numbers of users.
* Support increasing numbers of sellers and products.
* Allow future integration of additional services without major redesign.

---

### 3.6 Usability

The system shall:

* Provide a simple and user-friendly interface.
* Support responsive design for desktop, tablet, and mobile devices.
* Use clear navigation and consistent layouts.

---

### 3.7 Maintainability

The system shall:

* Use a modular software architecture.
* Follow consistent coding standards.
* Be easy to update and maintain.
* Include documentation for developers.

---

### 3.8 Compatibility

The system shall:

* Support modern web browsers including Google Chrome, Microsoft Edge, Mozilla Firefox, and Safari.
* Operate correctly on Windows, macOS, Linux, Android, and iOS through supported browsers.

---

### 3.9 Backup and Recovery

The system shall:

* Support regular database backups.
* Allow restoration of data from backups in case of failure.

---

### 3.10 Audit and Logging

The system shall:

* Record important system events such as user logins, failed login attempts, order creation, and payment processing.
* Maintain logs for troubleshooting and security monitoring.

## 4. Business Rules

The following business rules govern the operation of the NEXORA system.

### 4.1 User Rules

* Every user shall register using a unique email address.
* Every user shall have only one account per email address.
* Passwords shall never be stored in plain text.
* Every user shall have one role: Buyer, Seller, Delivery Agent, or Administrator.

### 4.2 Seller Rules

* Only verified sellers shall be allowed to publish products.
* Sellers may own multiple products.
* Sellers are responsible for maintaining accurate product information.
* Sellers shall not upload prohibited or illegal products.

### 4.3 Product Rules

* Every product shall belong to one seller.
* Every product shall belong to one category.
* Every product shall have at least one image.
* Products may contain multiple images.
* Products may contain multiple videos.
* Product prices shall be greater than zero.
* Product stock shall never be negative.

### 4.4 Order Rules

* Buyers may place multiple orders.
* Every order shall belong to one buyer.
* Orders shall contain at least one product.
* Cancelled orders shall not proceed to delivery.

### 4.5 Payment Rules

* Payments shall only be processed for valid orders.
* Every successful payment shall generate a transaction record.
* Cash on Delivery shall be marked as unpaid until delivery is confirmed.

### 4.6 Delivery Rules

* Every delivery shall be assigned to one delivery agent.
* Delivery status shall be updated throughout the delivery process.
* Delivered orders shall not be reassigned.

### 4.7 Review Rules

* Only buyers who have purchased a product may submit a review.
* Buyers may submit only one review per purchased product.
* Reviews shall not be editable after a defined period.
