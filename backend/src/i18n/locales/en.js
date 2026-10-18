// English (default / fallback) message catalog.
//
// Keys are dot-namespaced by feature area. Every key in every other
// locale file MUST also exist here - this file is the fallback used
// whenever a translation is missing in the active locale (see
// backend/src/i18n/index.js).
module.exports = {
    common: {
        somethingWentWrong: "Something went wrong. Please try again.",
        notFound: "Not found.",
        unauthorized: "Access denied. No token provided.",
        invalidToken: "Invalid or expired token.",
        forbidden: "You do not have permission to perform this action.",
        validationFailed: "Validation failed.",
        internalError: "Internal Server Error"
    },

    errors: {
        ACCOUNT_NOT_FOUND: "Account not found",
        INCORRECT_PASSWORD: "Incorrect password. Account was not deleted.",
        EMAIL_IN_USE: "That email is already in use by another account",
        PHONE_IN_USE: "That phone number is already in use by another account",
        REAUTH_EXPIRED: "Your verification expired. Please verify with a new code.",
        INVALID_CREDENTIALS: "Invalid email or password",
        NOTIFICATION_NOT_FOUND: "Notification not found",
        TERMS_NOT_ACCEPTED: "You must accept the Terms of Service and Privacy Policy to create an account",
        CATEGORY_UNAVAILABLE: "Selected category is not available",
        ACCOUNT_SUSPENDED: "This account has been suspended.",
        USERNAME_INVALID: "That username is not valid. Use 3-20 letters, numbers, underscores or dots.",
        USERNAME_RESERVED: "That username is reserved. Please choose another one.",
        USERNAME_TAKEN: "That username is already taken",
        USERNAME_CHANGE_TOO_SOON: "You can change your username again in {days} day(s).",
        GOOGLE_NOT_CONFIGURED: "Google sign-in is not available right now.",
        GOOGLE_TOKEN_INVALID: "We could not verify your Google sign-in. Please try again.",
        GOOGLE_EMAIL_UNVERIFIED: "Your Google email is not verified, so we cannot use it to sign in or create an account.",
        GOOGLE_ACCOUNT_CONFLICT: "This account is already linked to a different Google account.",
        GOOGLE_TICKET_INVALID: "Your Google sign-up expired. Please sign in with Google again.",
        GOOGLE_ACCOUNT_EXISTS: "An account with this Google account already exists. Please sign in.",
        ACCOUNT_LOCKED: "Too many failed sign-in attempts. Please try again in {minutes} minute(s), or reset your password to sign in now."
    },

    labels: {
        disputeType: {
            damaged_item: "Damaged item",
            delayed_delivery: "Delayed delivery",
            defective_product: "Defective product",
            wrong_item: "Wrong item",
            missing_delivery: "Missing delivery",
            other: "Other issue"
        },
        resolution: {
            refund_full: "a full refund",
            refund_partial: "a partial refund",
            replacement: "a replacement item",
            compensation: "compensation",
            no_action: "no action"
        },
        kycTier: {
            tier0: "Light signup",
            tier1: "ID verified",
            tier2: "Enhanced verification"
        }
    },

    notifications: {
        booking: {
            confirmed: {
                title: "Booking confirmed",
                message: "Your booking {reference} has been confirmed."
            }
        },
        "message.new.title": "New message from {senderName}",
        "message.new.message": "{preview}",

        "verification.approved.title": "Verification approved",
        "verification.approved.message": "Your {role} account has been verified. You now have full access to {role} features.",
        "verification.rejected.title": "Verification rejected",
        "verification.rejected.message": "Your {role} account verification was rejected: {reason}. Please contact support.",
        "verification.businessApproved.title": "Verified Seller badge approved",
        "verification.businessApproved.message": "Your business documents have been approved. Your store now shows the Verified Seller badge.",
        "verification.businessRejected.title": "Verified Seller request rejected",
        "verification.businessRejected.message": "Your Verified Seller request was rejected: {reason}. You can submit a new request with corrected documents.",

        "account.unsuspended.title": "Account reinstated",
        "account.unsuspended.message": "Your account has been reinstated. Welcome back!",
        "account.suspended.title": "Account suspended",
        "account.suspended.message": "Your account has been suspended: {reason}. Contact support if you believe this is a mistake.",

        "seller.storeVerified.title": "Store verified",
        "seller.storeVerified.message": "Congratulations! \"{storeName}\" has been verified.",
        "seller.storeUnverified.title": "Store verification removed",
        "seller.storeUnverified.message": "Verification for \"{storeName}\" has been removed.",
        "seller.approved.title": "Your account is approved to sell",
        "seller.approved.message": "NEXORA approved your ID, so you can sell now. To earn the Verified Seller badge, submit your business documents from the Verification page.",

        "product.reactivated.title": "Product reactivated",
        "product.reactivated.message": "Your product \"{productName}\" is visible again.",
        "product.removed.title": "Product removed",
        "product.removed.message": "Your product \"{productName}\" was removed by an administrator for review.",

        "service.reactivated.title": "Service reactivated",
        "service.reactivated.message": "Your service \"{serviceName}\" is visible again.",
        "service.removed.title": "Service removed",
        "service.removed.message": "Your service \"{serviceName}\" was removed by an administrator for review.",

        "delivery.update.title": "Delivery update",
        "delivery.update.message": "Your order {orderNumber} delivery status is now \"{status}\".",
        "delivery.pickedUp.title": "A delivery agent is on the way to pick up your order",
        "delivery.pickedUp.message": "Your order {orderNumber} has been picked up by a delivery agent.",
        "delivery.assigned.title": "New delivery assigned to you",
        "delivery.assigned.message": "You've been assigned to deliver order {orderNumber}.",

        "dispute.new.title": "New dispute filed",
        "dispute.new.message": "A buyer filed a dispute ({disputeNumber}) on order #{orderNumber}: {type}.",
        "dispute.newMessage.title": "New message on your dispute",
        "dispute.newMessage.message": "New reply on dispute {disputeNumber}.",
        "dispute.rejected.title": "Dispute rejected",
        "dispute.rejected.message": "Your dispute {disputeNumber} was rejected: {reason}",
        "dispute.resolved.title": "Dispute resolved",
        "dispute.resolved.buyerWithRefund": "Your dispute {disputeNumber} was resolved: {resolution} of {amount} approved.{noteSuffix}",
        "dispute.resolved.buyerNoRefund": "Your dispute {disputeNumber} was resolved: {resolution}.{noteSuffix}",
        "dispute.resolved.noteSuffix": " Note: {note}",
        "dispute.resolved.sellerMessage": "Dispute {disputeNumber} on your order was resolved: {resolution}.{refundNote}",
        "dispute.resolved.refundNote": " Refund amount: {amount}.",

        "return.requested.title": "New return request",
        "return.requested.message": "A buyer requested a return on order {orderNumber}.",
        "return.approved.title": "Return approved",
        "return.approved.message": "Your return request was approved. Ship the item back to continue.",
        "return.rejected.title": "Return rejected",
        "return.rejected.message": "Your return request was rejected: {reason}",
        "return.shippedBack.title": "Return shipped back",
        "return.shippedBack.message": "The buyer has shipped the item back to you.",
        "return.received.title": "Return received - refund on the way",
        "return.received.message": "Your returned item was received and a refund of {amount} has been triggered.",

        "kyc.approved.title": "Verification approved",
        "kyc.approved.message": "You've been upgraded to {tier}. Your order limit has increased.",
        "kyc.rejected.title": "Verification request rejected",
        "kyc.rejected.message": "Your verification upgrade request was rejected: {reason}",

        "support.reply.title": "New reply on your support ticket",
        "support.reply.message": "Our support team has replied to your ticket.",

        "order.placed.title": "Order placed",
        "order.placed.messageMultiVendor": "Your order {orderNumber} ({vendorCount} vendors) has been placed successfully.",
        "order.placed.messageSingle": "Your order {orderNumber} ({itemSummary}) has been placed successfully.",
        "order.handoverCode.title": "Your delivery code",
        "order.handoverCode.message": "Your NEXORA order {orderNumber} delivery code is {code}. Give this code to the rider when your order arrives - don't share it before then.",
        "order.cancelled.title": "Order cancelled",
        "order.cancelled.message": "Your order {orderNumber} has been cancelled.",
        "order.cancelled.messageWithItem": "Your order {orderNumber} ({itemSummary}) has been cancelled.",
        "order.cancelledUnpaid.message": "Your order {orderNumber} was cancelled because payment was never completed. Feel free to place it again.",
        "order.cancelledUnpaid.messageWithItem": "Your order {orderNumber} ({itemSummary}) was cancelled because payment was never completed. Feel free to place it again.",
        "payment.paidAfterCancel.title": "Payment received for a cancelled order",
        "payment.paidAfterCancel.message": "We received your payment for order {orderNumber}, but the order had already been cancelled. Our team will review it and refund you.",
        "payment.notReceived.title": "We did not receive your payment",
        "payment.notReceived.message": "We did not receive your payment, so it was not completed. Please try again.",
        "order.statusUpdated.title": "Order status updated",
        "order.statusUpdated.message": "Your order {orderNumber} is now \"{status}\".",
        "order.statusUpdated.messageWithItem": "Your order {orderNumber} ({itemSummary}) is now \"{status}\".",
        "order.preorderDepositPaid.title": "Deposit received",
        "order.preorderDepositPaid.message": "We've received your deposit for order {orderNumber}. We'll let you know once it's ready and the remaining balance is due.",
        "order.preorderBalanceDue.title": "Balance payment due",
        "order.preorderBalanceDue.message": "Your made-to-order item for order {orderNumber} is ready! Please pay the remaining balance of {balanceAmount} to have it shipped.",

        "wallet.credited.title": "Wallet credited",
        "wallet.credited.message": "Your wallet has been credited for order #{orderId}.",
        "wallet.codCommissionDebited.title": "Cash on Delivery commission debited",
        "wallet.codCommissionDebited.message": "Your platform commission for Cash on Delivery order #{orderId} has been debited from your wallet.",
        "wallet.released.title": "Held earnings released",
        "wallet.released.message": "Some of your held earnings have cleared the escrow hold period and are now available to withdraw.",
        "withdrawal.status.title": "Withdrawal {status}",
        "withdrawal.rejected.message": "Your withdrawal request of {amount} was rejected and refunded to your wallet.{note}",
        "withdrawal.status.message": "Your withdrawal request of {amount} is now \"{status}\".",
        "withdrawal.note": " Note: {note}",

        "sponsorship.started.title": "Sponsorship campaign started",
        "sponsorship.started.message": "Your {days}-day sponsorship campaign for \"{productName}\" is now live ({amount} charged to your wallet).",
        "sponsorship.expired.title": "Sponsorship campaign ended",
        "sponsorship.expired.message": "Your sponsorship campaign for \"{productName}\" has ended. Start a new one any time from your seller dashboard.",

        "featuredStore.started.title": "Featured store campaign started",
        "featuredStore.started.message": "Your {days}-day featured placement in \"{categoryName}\" is now live ({amount} charged to your wallet).",
        "featuredStore.expired.title": "Featured store campaign ended",
        "featuredStore.expired.message": "Your featured store campaign in \"{categoryName}\" has ended. Start a new one any time from your seller dashboard.",

        "subscription.expiring.title": "Your seller plan is ending soon",
        "subscription.expiring.message": "Your {planName} plan runs until {date}. Renew from your seller dashboard to keep its benefits.",
        "subscription.renewal.title": "Renew your seller plan",
        "subscription.renewal.message": "Your {planName} plan renews on {date}. Pay from your seller dashboard to keep its benefits without a gap.",
        "trial.midway.title": "Your free trial has 2 days left",
        "trial.midway.message": "Your 7-day free trial ends in about 2 days. Choose a plan from your seller dashboard to keep Analytics, POS and the other plan features.",
        "trial.lastDay.title": "Last day of your free trial",
        "trial.lastDay.message": "Your free trial ends within 24 hours. Choose a plan now to keep Analytics, POS and the other plan features without a gap.",
        "trial.expired.title": "Your free trial has ended",
        "trial.expired.message": "Trial ended - choose a plan to keep Analytics and POS. You can keep selling on the Free plan.",
        "trial.extended.title": "Your free trial was extended",
        "trial.extended.message": "Good news: your free trial now runs {days} more day(s)."
    },

    otp: {
        channelName: { email: "email", sms: "SMS", whatsapp: "WhatsApp" },
        channelFailed: "We couldn't send the code by {channel}. Please choose another method.",
        subject: {
            login: "Your NEXORA sign-in code",
            password_change: "Your NEXORA password change code",
            password_reset: "Your NEXORA password reset code",
            default: "Your NEXORA verification code"
        },
        intro: {
            login: "Use this code to finish signing in to NEXORA:",
            password_change: "Use this code to verify it's you before changing your NEXORA password:",
            password_reset: "Use this code to reset your NEXORA password:"
        },
        expiry: "This code expires in {minutes} minutes. If you didn't request this, you can safely ignore this message.",
        sms: "NEXORA code: {code}. It expires in {minutes} minutes. Never share this code with anyone."
    },
    email: {
        cta: { view: "View in NEXORA" },
        supportLabel: "Need help? Contact support",
        manageLabel: "Manage notification emails",
        // Previously told people NOT to reply, which is exactly the
        // "no-reply bulk mail" shape that makes mail clients file a
        // message under Promotions/Updates instead of Primary - now that
        // config/brevo.js sets a real Reply-To, this should invite a
        // reply instead of discouraging one.
        footer: "This message was sent by NEXORA - reply any time if you need help.",
        tagline: "Tanzania's marketplace",
        greetingPrefix: "Hi"
    }
};
