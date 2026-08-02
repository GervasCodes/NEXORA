# Nexora Services

> Multi-Vendor Booking & Service Marketplace for the Nexora Ecosystem

---

# Overview

Nexora Products is already operational and provides a complete multi-vendor e-commerce platform for selling physical and digital products.

Nexora Services extends the ecosystem by introducing a unified booking infrastructure that enables businesses and individuals to offer bookable services through the same platform.

The goal is to create a single commerce ecosystem where merchants can sell products, services, or both from one account.

---

# Vision

Build the leading multi-vendor service marketplace that enables customers to discover, compare, book, pay for, and review services from verified providers.

Nexora Services should support:

* Accommodation Booking
* Car Rentals
* Tours & Activities
* Event Spaces
* Equipment Rentals
* Transportation Services
* Professional Services
* Healthcare Appointments
* Lifestyle Services

without requiring separate systems for each category.

---

# Business Model

Nexora supports three merchant types.

## Product Seller

Sells physical or digital products.

Examples:

* Electronics Store
* Fashion Store
* Furniture Store

Flow:

```text
Product
 → Cart
 → Order
 → Payment
 → Delivery
```

---

## Service Provider

Sells bookable services.

Examples:

* Hotel
* Car Rental Agency
* Tour Operator
* Conference Center

Flow:

```text
Service
 → Availability
 → Booking
 → Payment
 → Service Delivery
```

---

## Hybrid Merchant

Sells both products and services.

Examples:

* Hotel selling rooms and souvenirs
* Travel company selling tours and travel accessories
* Event center selling bookings and merchandise

Flow:

```text
Products + Services
```

under a single merchant account.

---

# Merchant Classification

Every merchant account must contain a merchant type.

```ts
enum MerchantType {
  PRODUCT_SELLER,
  SERVICE_PROVIDER,
  HYBRID
}
```

---

# Registration Flow

## Step 1

Create Account

## Step 2

Register Business

## Step 3

Select Merchant Type

```text
What do you want to sell?

[ ] Products
[ ] Services
[ ] Products & Services
```

## Step 4

System assigns:

```text
PRODUCT_SELLER
SERVICE_PROVIDER
HYBRID
```

---

# Services Domain Architecture

```text
services/
│
├── categories/
├── providers/
├── listings/
├── availability/
├── bookings/
├── payouts/
├── reviews/
├── analytics/
└── notifications/
```

---

# Core Principles

## Reuse Existing Infrastructure

The following Nexora systems already exist and must be reused:

* Authentication
* User Management
* Wallet
* Payments
* Escrow
* Refunds
* Reviews
* Notifications
* Chat
* Disputes
* Analytics

No duplicate implementations should be created.

---

## Build One Booking Engine

Do not build separate systems for:

* Hotels
* Cars
* Tours
* Meeting Rooms

Instead build:

```text
Service
Availability
Booking
```

and allow categories to define their own attributes.

---

# Service Categories

## Phase 1 Categories

### Accommodation

* Hotels
* Apartments
* Villas
* Guest Houses
* Lodges

### Transportation

* Car Rentals
* Motorcycle Rentals
* Airport Transfers

### Tourism

* Tours
* Safari Packages
* Travel Experiences

### Business Spaces

* Conference Halls
* Meeting Rooms
* Training Facilities

---

# Future Categories

## Professional Services

* Consultants
* Lawyers
* Accountants

## Healthcare

* Doctors
* Clinics
* Specialists

## Lifestyle

* Salons
* Fitness Trainers
* Beauty Professionals

## Rentals

* Equipment Rental
* Camera Rental
* Machinery Rental

---

# Core Entities

## Service Provider

Represents the business offering services.

```ts
Provider {
  id
  businessName
  ownerId
  merchantType
  verificationStatus
  rating
  status
}
```

---

## Service Category

Represents a grouping of services.

```ts
ServiceCategory {
  id
  name
  slug
  description
  status
}
```

---

## Service

Represents a bookable listing.

```ts
Service {
  id
  providerId
  categoryId
  title
  description
  location
  pricingModel
  status
  rating
}
```

Examples:

* Deluxe Room
* Toyota Prado Rental
* 3-Day Safari
* Conference Hall

---

## Service Media

```ts
ServiceMedia {
  id
  serviceId
  url
  type
}
```

---

# Availability Engine

The availability engine controls inventory.

Examples:

```text
Hotel:
20 rooms available

Car Rental:
5 vehicles available

Tour:
30 seats available

Meeting Room:
1 room available
```

## Availability Entity

```ts
Availability {
  id
  serviceId
  date
  availableUnits
  price
  status
}
```

---

# Booking Engine

Bookings are the service equivalent of orders.

## Booking Entity

```ts
Booking {
  id
  serviceId
  providerId
  customerId
  startDate
  endDate
  quantity
  amount
  status
  paymentStatus
}
```

---

# Booking Lifecycle

```text
PENDING

CONFIRMED

ACTIVE

COMPLETED

CANCELLED

REFUNDED

REJECTED
```

REJECTED (Phase 5 - Booking Status Review, migration 070) is reachable
only from PENDING, via a provider-only decline action distinct from
CANCELLED - see booking.service.js#rejectBooking. A pending booking
that was already paid still exits through REFUNDED as before; REJECTED
only replaces CANCELLED for the unpaid case, so the payment flow is
unchanged.

---

# Payment Architecture

Reuse the existing Nexora payment infrastructure.

## Existing Components

* Wallet
* Escrow
* Earnings
* Refunds
* Disputes
* Commission Engine

## Payment Flow

```text
Customer
    ↓
Booking Payment
    ↓
Escrow
    ↓
Booking Confirmation
    ↓
Service Delivery
    ↓
Commission Deduction
    ↓
Provider Payout
```

---

# Reviews & Ratings

Reviews must support:

```text
Products
Services
Stores
Providers
```

Review functionality should be shared across the platform.

---

# Notifications

Trigger notifications for:

```text
Booking Created
Booking Confirmed
Booking Cancelled
Booking Completed
Payment Received
Refund Issued
Payout Released
```

Channels:

* Email
* SMS
* Push Notifications
* In-App Notifications

---

# Provider Dashboard

Every service provider receives access to:

## Service Management

* Create Service
* Edit Service
* Delete Service
* Manage Media

## Availability Management

* Calendar
* Inventory
* Pricing

## Booking Management

* View Bookings
* Confirm Bookings
* Cancel Bookings
* Manage Refunds

## Financial Management

* Earnings
* Payouts
* Transaction History

## Analytics

* Revenue
* Bookings
* Occupancy
* Conversion Metrics

---

# Permission Matrix

## Product Seller

Access:

```text
Products
Inventory
Orders
Shipping
```

Restricted:

```text
Services
Bookings
Availability
```

---

## Service Provider

Access:

```text
Services
Bookings
Availability
Payouts
```

Restricted:

```text
Products
Inventory
Shipping
```

---

## Hybrid Merchant

Access:

```text
Products
Services
Orders
Bookings
Inventory
Availability
Payouts
```

---

Enforcement: both single-type restrictions above are enforced
server-side, not just by the seller dashboard hiding the corresponding
tabs - `requireServiceProvider` blocks a Product Seller's direct calls
into Services/Bookings/Availability, and `requireProductProvider`
(Phase 7 - Final Review) closes the mirror-image gap that existed
until then, blocking a Service Provider's direct calls into product
create/update/deactivate/reactivate and image/video/audio upload.
Shipping (the delivery module) is shared infrastructure used by both
delivery agents and sellers and was left out of this pass - flagged
for a follow-up review rather than folded into Phase 7, since scoping
it correctly needs its own look at the delivery-agent side of that
module.

---

# Customer Journey

```text
Search Services
       ↓
View Listing
       ↓
Check Availability
       ↓
Select Date
       ↓
Create Booking
       ↓
Payment
       ↓
Confirmation
       ↓
Service Delivery
       ↓
Review
```

---

# Provider Journey

```text
Register
     ↓
Verification
     ↓
Create Service
     ↓
Configure Availability
     ↓
Publish Listing
     ↓
Receive Bookings
     ↓
Deliver Service
     ↓
Receive Payout
```

---

# Database Tables

```text
service_categories

service_providers

services

service_media

service_availability

bookings

booking_items

provider_payouts
```

---

# Development Roadmap

## Phase 1

Foundation

* Merchant Type System
* Service Categories
* Service Providers
* Service Listings

## Phase 2

Booking Infrastructure

* Availability Engine
* Booking Engine
* Booking Lifecycle

## Phase 3

Financial Integration

* Escrow Integration
* Payouts
* Commission Management

## Phase 4

Customer Experience

* Reviews
* Notifications
* Search & Filters

## Phase 5

Growth

* Analytics
* Dynamic Pricing
* Advanced Reporting
* Additional Service Categories

---

# Long-Term Vision

Nexora Services will become a universal booking infrastructure operating alongside Nexora Products.

```text
NEXORA

├── Products Marketplace
│
├── Services Marketplace
│   ├── Accommodation
│   ├── Transportation
│   ├── Tourism
│   ├── Events
│   ├── Healthcare
│   ├── Professional Services
│   └── Rentals
│
├── Payments
├── Wallet
├── Reviews
├── Chat
├── Notifications
├── Analytics
└── Merchant Ecosystem
```

The objective is to ensure that any merchant can sell anything that can be purchased, booked, rented, reserved, or scheduled through a single Nexora account.