// Kiswahili (Swahili) message catalog.
//
// Must mirror the key structure of en.js exactly. Any key missing here
// automatically falls back to the English text - see
// backend/src/i18n/index.js - so it is safe to add new English keys
// first and translate them into Swahili afterwards.
module.exports = {
    common: {
        somethingWentWrong: "Hitilafu imetokea. Tafadhali jaribu tena.",
        notFound: "Haijapatikana.",
        unauthorized: "Ufikiaji umekataliwa. Hakuna tokeni iliyotolewa.",
        invalidToken: "Tokeni si sahihi au imeisha muda wake.",
        forbidden: "Huna ruhusa ya kufanya hatua hii.",
        validationFailed: "Uthibitishaji wa data umeshindwa.",
        internalError: "Hitilafu ya ndani ya seva"
    },

    errors: {
        ACCOUNT_NOT_FOUND: "Akaunti haikupatikana",
        INCORRECT_PASSWORD: "Nenosiri si sahihi. Akaunti haikufutwa.",
        EMAIL_IN_USE: "Barua pepe hiyo tayari inatumiwa na akaunti nyingine",
        PHONE_IN_USE: "Namba hiyo ya simu tayari inatumiwa na akaunti nyingine",
        REAUTH_EXPIRED: "Uthibitisho wako umeisha muda wake. Tafadhali thibitisha tena kwa msimbo mpya.",
        INVALID_CREDENTIALS: "Barua pepe au nenosiri si sahihi",
        NOTIFICATION_NOT_FOUND: "Arifa haikupatikana",
        TERMS_NOT_ACCEPTED: "Lazima ukubali Masharti ya Huduma na Sera ya Faragha ili kuunda akaunti"
    },

    labels: {
        disputeType: {
            damaged_item: "Bidhaa iliyoharibika",
            delayed_delivery: "Usafirishaji uliochelewa",
            defective_product: "Bidhaa yenye kasoro",
            wrong_item: "Bidhaa isiyo sahihi",
            missing_delivery: "Usafirishaji uliopotea",
            other: "Tatizo lingine"
        },
        resolution: {
            refund_full: "kurejeshewa kamili",
            refund_partial: "kurejeshewa kwa sehemu",
            replacement: "bidhaa mbadala",
            compensation: "fidia",
            no_action: "hakuna hatua"
        }
    },

    notifications: {
        "verification.approved.title": "Uthibitisho umekubaliwa",
        "verification.approved.message": "Akaunti yako ya {role} imethibitishwa. Sasa una ufikiaji kamili wa vipengele vya {role}.",
        "verification.rejected.title": "Uthibitisho umekataliwa",
        "verification.rejected.message": "Uthibitisho wa akaunti yako ya {role} umekataliwa: {reason}. Tafadhali wasiliana na msaada.",

        "account.reactivated.title": "Akaunti imewashwa tena",
        "account.reactivated.message": "Akaunti yako imewashwa tena. Karibu tena!",
        "account.deactivated.title": "Akaunti imezimwa",
        "account.deactivated.message": "Akaunti yako imezimwa. Wasiliana na msaada ikiwa unaamini hii ni makosa.",

        "seller.storeVerified.title": "Duka limethibitishwa",
        "seller.storeVerified.message": "Hongera! \"{storeName}\" imethibitishwa.",
        "seller.storeUnverified.title": "Uthibitisho wa duka umeondolewa",
        "seller.storeUnverified.message": "Uthibitisho wa \"{storeName}\" umeondolewa.",
        "seller.badge.title": "Sasa wewe ni Muuzaji Aliyethibitishwa!",
        "seller.badge.message": "Beji yako ya Muuzaji Aliyethibitishwa iko hai. Uchambuzi wa kina, ripoti za mapato na zana za premium sasa zimefunguliwa.",

        "product.reactivated.title": "Bidhaa imewashwa tena",
        "product.reactivated.message": "Bidhaa yako \"{productName}\" inaonekana tena.",
        "product.removed.title": "Bidhaa imeondolewa",
        "product.removed.message": "Bidhaa yako \"{productName}\" iliondolewa na msimamizi kwa ukaguzi.",

        "delivery.update.title": "Taarifa ya usafirishaji",
        "delivery.update.message": "Hali ya usafirishaji wa agizo lako {orderNumber} sasa ni \"{status}\".",
        "delivery.pickedUp.title": "Wakala wa usafirishaji anaelekea kuchukua agizo lako",
        "delivery.pickedUp.message": "Agizo lako {orderNumber} limechukuliwa na wakala wa usafirishaji.",
        "delivery.assigned.title": "Usafirishaji mpya umekukabidhiwa",
        "delivery.assigned.message": "Umekabidhiwa kusafirisha agizo {orderNumber}.",

        "dispute.new.title": "Mgogoro mpya umefunguliwa",
        "dispute.new.message": "Mnunuzi amefungua mgogoro ({disputeNumber}) kuhusu agizo #{orderNumber}: {type}.",
        "dispute.newMessage.title": "Ujumbe mpya kwenye mgogoro wako",
        "dispute.newMessage.message": "Jibu jipya kwenye mgogoro {disputeNumber}.",
        "dispute.rejected.title": "Mgogoro umekataliwa",
        "dispute.rejected.message": "Mgogoro wako {disputeNumber} umekataliwa: {reason}",
        "dispute.resolved.title": "Mgogoro umetatuliwa",
        "dispute.resolved.buyerWithRefund": "Mgogoro wako {disputeNumber} umetatuliwa: {resolution} ya {amount} imeidhinishwa.{noteSuffix}",
        "dispute.resolved.buyerNoRefund": "Mgogoro wako {disputeNumber} umetatuliwa: {resolution}.{noteSuffix}",
        "dispute.resolved.noteSuffix": " Kumbuka: {note}",
        "dispute.resolved.sellerMessage": "Mgogoro {disputeNumber} kwenye agizo lako umetatuliwa: {resolution}.{refundNote}",
        "dispute.resolved.refundNote": " Kiasi cha kurejeshwa: {amount}.",

        "order.placed.title": "Agizo limewekwa",
        "order.placed.messageMultiVendor": "Agizo lako {orderNumber} (wachuuzi {vendorCount}) limewekwa kwa mafanikio.",
        "order.placed.messageSingle": "Agizo lako {orderNumber} limewekwa kwa mafanikio.",
        "order.cancelled.title": "Agizo limeghairiwa",
        "order.cancelled.message": "Agizo lako {orderNumber} limeghairiwa.",
        "order.cancelledUnpaid.message": "Agizo lako {orderNumber} limeghairiwa kwa sababu malipo hayakukamilika. Jisikie huru kuliweka tena.",
        "order.statusUpdated.title": "Hali ya agizo imesasishwa",
        "order.statusUpdated.message": "Agizo lako {orderNumber} sasa ni \"{status}\".",

        "wallet.credited.title": "Pochi imeongezwa fedha",
        "wallet.credited.message": "Pochi yako imeongezwa fedha kwa ajili ya agizo #{orderId}.",
        "wallet.released.title": "Mapato yaliyoshikiliwa yametolewa",
        "wallet.released.message": "Baadhi ya mapato yako yaliyoshikiliwa yamemaliza kipindi cha kusubiri na sasa yanapatikana kutolewa.",
        "withdrawal.status.title": "Utoaji {status}",
        "withdrawal.rejected.message": "Ombi lako la kutoa {amount} limekataliwa na kurejeshwa kwenye pochi yako.{note}",
        "withdrawal.status.message": "Ombi lako la kutoa {amount} sasa ni \"{status}\".",
        "withdrawal.note": " Kumbuka: {note}",

        "sponsorship.started.title": "Kampeni ya udhamini imeanza",
        "sponsorship.started.message": "Kampeni yako ya udhamini ya siku {days} kwa \"{productName}\" sasa inaonekana (kiasi {amount} kimetozwa kwenye pochi yako).",
        "sponsorship.expired.title": "Kampeni ya udhamini imekamilika",
        "sponsorship.expired.message": "Kampeni yako ya udhamini kwa \"{productName}\" imekamilika. Anzisha nyingine wakati wowote kutoka dashibodi yako ya muuzaji.",

        "featuredStore.started.title": "Kampeni ya kuonyeshwa duka imeanza",
        "featuredStore.started.message": "Kampeni yako ya kuonyeshwa duka ya siku {days} katika \"{categoryName}\" sasa inaonekana (kiasi {amount} kimetozwa kwenye pochi yako).",
        "featuredStore.expired.title": "Kampeni ya kuonyeshwa duka imekamilika",
        "featuredStore.expired.message": "Kampeni yako ya kuonyeshwa duka katika \"{categoryName}\" imekamilika. Anzisha nyingine wakati wowote kutoka dashibodi yako ya muuzaji.",

        "departmentSponsorship.started.title": "Kampeni ya udhamini wa idara imeanza",
        "departmentSponsorship.started.message": "Kampeni yako ya udhamini ya siku {days} kwa idara \"{categoryName}\" kwenye ukurasa wa nyumbani sasa inaonekana (kiasi {amount} kimetozwa kwenye pochi yako).",
        "departmentSponsorship.expired.title": "Kampeni ya udhamini wa idara imekamilika",
        "departmentSponsorship.expired.message": "Kampeni yako ya udhamini wa idara \"{categoryName}\" imekamilika. Anzisha nyingine wakati wowote kutoka dashibodi yako ya muuzaji."
    },

    email: {
        footer: "Huu ni ujumbe wa kiotomatiki kutoka NEXORA. Tafadhali usijibu moja kwa moja kwa barua pepe hii."
    }
};
