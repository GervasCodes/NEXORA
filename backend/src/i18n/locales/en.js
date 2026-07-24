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
        TERMS_NOT_ACCEPTED: "You must accept the Terms of Service and Privacy Policy to create an account"
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
        }
    },

    notifications: {
        "verification.approved.title": "Verification approved",
        "verification.approved.message": "Your {role} account has been verified. You now have full access to {role} features.",
        "verification.rejected.title": "Verification rejected",
        "verification.rejected.message": "Your {role} account verification was rejected: {reason}. Please contact support.",

        "account.reactivated.title": "Account reactivated",
        "account.reactivated.message": "Your account has been reactivated. Welcome back!",
        "account.deactivated.title": "Account deactivated",
        "account.deactivated.message": "Your account has been deactivated. Contact support if you believe this is a mistake.",

        "seller.storeVerified.title": "Store verified",
        "seller.storeVerified.message": "Congratulations! \"{storeName}\" has been verified.",
        "seller.storeUnverified.title": "Store verification removed",
        "seller.storeUnverified.message": "Verification for \"{storeName}\" has been removed.",
        "seller.badge.title": "You're now a Verified Seller!",
        "seller.badge.message": "Your Verified Seller badge is live. Advanced analytics, revenue reports and premium tools are now unlocked.",

        "product.reactivated.title": "Product reactivated",
        "product.reactivated.message": "Your product \"{productName}\" is visible again.",
        "product.removed.title": "Product removed",
        "product.removed.message": "Your product \"{productName}\" was removed by an administrator for review.",

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

        "order.placed.title": "Order placed",
        "order.placed.messageMultiVendor": "Your order {orderNumber} ({vendorCount} vendors) has been placed successfully.",
        "order.placed.messageSingle": "Your order {orderNumber} has been placed successfully.",
        "order.cancelled.title": "Order cancelled",
        "order.cancelled.message": "Your order {orderNumber} has been cancelled.",
        "order.cancelledUnpaid.message": "Your order {orderNumber} was cancelled because payment was never completed. Feel free to place it again.",
        "order.statusUpdated.title": "Order status updated",
        "order.statusUpdated.message": "Your order {orderNumber} is now \"{status}\".",

        "wallet.credited.title": "Wallet credited",
        "wallet.credited.message": "Your wallet has been credited for order #{orderId}.",
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

        "departmentSponsorship.started.title": "Department sponsorship started",
        "departmentSponsorship.started.message": "Your {days}-day sponsorship of \"{categoryName}\" on the homepage is now live ({amount} charged to your wallet).",
        "departmentSponsorship.expired.title": "Department sponsorship ended",
        "departmentSponsorship.expired.message": "Your sponsorship of \"{categoryName}\" has ended. Start a new one any time from your seller dashboard."
    },

    email: {
        footer: "This is an automated message from NEXORA. Please do not reply directly to this email."
    }
};
