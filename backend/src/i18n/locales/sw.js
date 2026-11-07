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
        TERMS_NOT_ACCEPTED: "Lazima ukubali Masharti ya Huduma na Sera ya Faragha ili kuunda akaunti",
        CATEGORY_UNAVAILABLE: "Kundi ulilochagua halipatikani",
        ACCOUNT_SUSPENDED: "Akaunti hii imesimamishwa.",
        USERNAME_INVALID: "Jina hilo la mtumiaji si sahihi. Tumia herufi, namba, mstari wa chini au nukta (herufi 3 hadi 20).",
        USERNAME_RESERVED: "Jina hilo la mtumiaji limehifadhiwa. Tafadhali chagua lingine.",
        USERNAME_TAKEN: "Jina hilo la mtumiaji tayari limechukuliwa",
        USERNAME_CHANGE_TOO_SOON: "Unaweza kubadilisha jina lako la mtumiaji tena baada ya siku {days}.",
        GOOGLE_NOT_CONFIGURED: "Kuingia kwa Google hakupatikani kwa sasa.",
        GOOGLE_TOKEN_INVALID: "Hatukuweza kuthibitisha kuingia kwako kwa Google. Tafadhali jaribu tena.",
        GOOGLE_EMAIL_UNVERIFIED: "Barua pepe yako ya Google haijathibitishwa, kwa hivyo hatuwezi kuitumia kuingia au kufungua akaunti.",
        GOOGLE_ACCOUNT_CONFLICT: "Akaunti hii tayari imeunganishwa na akaunti nyingine ya Google.",
        GOOGLE_TICKET_INVALID: "Usajili wako kwa Google umeisha muda. Tafadhali ingia tena kwa Google.",
        GOOGLE_ACCOUNT_EXISTS: "Akaunti yenye akaunti hii ya Google tayari ipo. Tafadhali ingia.",
        ACCOUNT_LOCKED: "Umejaribu kuingia mara nyingi bila mafanikio. Tafadhali jaribu tena baada ya dakika {minutes}, au weka upya nenosiri lako ili uingie sasa."
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
        },
        kycTier: {
            tier0: "Usajili rahisi",
            tier1: "Kitambulisho kimethibitishwa",
            tier2: "Uthibitisho wa hali ya juu"
        }
    },

    notifications: {
        booking: {
            confirmed: {
                title: "Uhifadhi umethibitishwa",
                message: "Uhifadhi wako {reference} umethibitishwa."
            }
        },
        "message.new.title": "Ujumbe mpya kutoka kwa {senderName}",
        "message.new.message": "{preview}",

        "verification.approved.title": "Uthibitisho umekubaliwa",
        "verification.approved.message": "Akaunti yako ya {role} imethibitishwa. Sasa una ufikiaji kamili wa vipengele vya {role}.",
        "verification.rejected.title": "Uthibitisho umekataliwa",
        "verification.rejected.message": "Uthibitisho wa akaunti yako ya {role} umekataliwa: {reason}. Tafadhali wasiliana na msaada.",
        "verification.businessApproved.title": "Beji ya Muuzaji Aliyethibitishwa imekubaliwa",
        "verification.businessApproved.message": "Nyaraka za biashara yako zimekubaliwa. Duka lako sasa linaonyesha alama ya Muuzaji Aliyethibitishwa.",
        "verification.businessRejected.title": "Ombi la Muuzaji Aliyethibitishwa limekataliwa",
        "verification.businessRejected.message": "Ombi lako la Muuzaji Aliyethibitishwa limekataliwa: {reason}. Unaweza kuwasilisha ombi jipya lenye nyaraka zilizosahihishwa.",

        "account.unsuspended.title": "Akaunti imerejeshwa",
        "account.unsuspended.message": "Akaunti yako imerejeshwa. Karibu tena!",
        "account.suspended.title": "Akaunti imesimamishwa",
        "account.suspended.message": "Akaunti yako imesimamishwa: {reason}. Wasiliana na msaada ikiwa unaamini hii ni makosa.",

        "seller.storeVerified.title": "Duka limethibitishwa",
        "seller.storeVerified.message": "Hongera! \"{storeName}\" imethibitishwa.",
        "seller.storeUnverified.title": "Uthibitisho wa duka umeondolewa",
        "seller.storeUnverified.message": "Uthibitisho wa \"{storeName}\" umeondolewa.",
        "seller.approved.title": "Akaunti yako imeidhinishwa kuuza",
        "seller.approved.message": "NEXORA imeidhinisha kitambulisho chako, kwa hiyo unaweza kuuza sasa. Ili kupata beji ya Muuzaji Aliyethibitishwa, wasilisha nyaraka za biashara yako kupitia ukurasa wa Uthibitisho.",

        "product.reactivated.title": "Bidhaa imewashwa tena",
        "product.reactivated.message": "Bidhaa yako \"{productName}\" inaonekana tena.",
        "product.removed.title": "Bidhaa imeondolewa",
        "product.removed.message": "Bidhaa yako \"{productName}\" iliondolewa na msimamizi kwa ukaguzi.",

        "service.reactivated.title": "Huduma imewashwa tena",
        "service.reactivated.message": "Huduma yako \"{serviceName}\" inaonekana tena.",
        "service.removed.title": "Huduma imeondolewa",
        "service.removed.message": "Huduma yako \"{serviceName}\" iliondolewa na msimamizi kwa ukaguzi.",

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

        "return.requested.title": "Ombi jipya la kurejesha bidhaa",
        "return.requested.message": "Mnunuzi ameomba kurejesha bidhaa kwenye agizo {orderNumber}.",
        "return.approved.title": "Ombi la kurejesha limekubaliwa",
        "return.approved.message": "Ombi lako la kurejesha limekubaliwa. Rejesha bidhaa ili kuendelea.",
        "return.rejected.title": "Ombi la kurejesha limekataliwa",
        "return.rejected.message": "Ombi lako la kurejesha limekataliwa: {reason}",
        "return.shippedBack.title": "Bidhaa imerejeshwa",
        "return.shippedBack.message": "Mnunuzi amekurejeshea bidhaa.",
        "return.received.title": "Bidhaa imepokelewa - marejesho yanaendelea",
        "return.received.message": "Bidhaa yako iliyorejeshwa imepokelewa na marejesho ya {amount} yameanzishwa.",

        "kyc.approved.title": "Uthibitisho umekubaliwa",
        "kyc.approved.message": "Umepandishwa hadi {tier}. Kiwango chako cha agizo kimeongezeka.",
        "kyc.rejected.title": "Ombi la uthibitisho limekataliwa",
        "kyc.rejected.message": "Ombi lako la kupandisha uthibitisho limekataliwa: {reason}",

        "support.reply.title": "Jibu jipya kwenye ombi lako la usaidizi",
        "support.reply.message": "Timu yetu ya usaidizi imejibu ombi lako.",

        "order.placed.title": "Agizo limewekwa",
        "order.placed.messageMultiVendor": "Agizo lako {orderNumber} (wachuuzi {vendorCount}) limewekwa kwa mafanikio.",
        "order.placed.messageSingle": "Agizo lako {orderNumber} ({itemSummary}) limewekwa kwa mafanikio.",
        "order.handoverCode.title": "Nambari yako ya uwasilishaji",
        "order.handoverCode.message": "Nambari ya uwasilishaji ya agizo lako la NEXORA {orderNumber} ni {code}. Mpe rider nambari hii agizo lako linapowasili - usiitoe kabla ya hapo.",
        "order.cancelled.title": "Agizo limeghairiwa",
        "order.cancelled.message": "Agizo lako {orderNumber} limeghairiwa.",
        "order.cancelled.messageWithItem": "Agizo lako {orderNumber} ({itemSummary}) limeghairiwa.",
        "order.cancelledUnpaid.message": "Agizo lako {orderNumber} limeghairiwa kwa sababu malipo hayakukamilika. Jisikie huru kuliweka tena.",
        "order.cancelledUnpaid.messageWithItem": "Agizo lako {orderNumber} ({itemSummary}) limeghairiwa kwa sababu malipo hayakukamilika. Jisikie huru kuliweka tena.",
        "payment.paidAfterCancel.title": "Malipo yamepokelewa kwa agizo lililoghairiwa",
        "payment.paidAfterCancel.message": "Tumepokea malipo yako ya agizo {orderNumber}, lakini agizo lilikuwa limeghairiwa tayari. Timu yetu itayakagua na kukurudishia pesa zako.",
        "payment.notReceived.title": "Hatukupokea malipo yako",
        "payment.notReceived.message": "Hatukupokea malipo yako, kwa hivyo hayakukamilika. Tafadhali jaribu tena.",
        "order.statusUpdated.title": "Hali ya agizo imesasishwa",
        "order.statusUpdated.message": "Agizo lako {orderNumber} sasa ni \"{status}\".",
        "order.statusUpdated.messageWithItem": "Agizo lako {orderNumber} ({itemSummary}) sasa ni \"{status}\".",
        "order.preorderDepositPaid.title": "Malipo ya awali yamepokelewa",
        "order.preorderDepositPaid.message": "Tumepokea malipo yako ya awali kwa agizo {orderNumber}. Tutakujulisha litakapokuwa tayari na salio linalobaki litahitajika.",
        "order.preorderBalanceDue.title": "Salio la malipo linahitajika",
        "order.preorderBalanceDue.message": "Bidhaa yako maalum ya agizo {orderNumber} iko tayari! Tafadhali lipa salio linalobaki la {balanceAmount} ili itumwe.",
        "order.preorderReady.title": "Oda yako iko tayari",
        "order.preorderReady.message": "Bidhaa yako maalum ya oda {orderNumber} iko tayari na itakabidhiwa kwa dereva hivi karibuni.",
        "order.preorderDueSoon.title": "Bidhaa maalum inatakiwa kesho",
        "order.preorderDueSoon.message": "Oda {orderNumber} inatakiwa kuwa tayari kufikia {readyBy}. Iweke \"tayari\" kwenye oda zako ukimaliza.",
        "order.preorderOverdueSeller.title": "Bidhaa maalum imechelewa",
        "order.preorderOverdueSeller.message": "Oda {orderNumber} imepita tarehe ya kuwa tayari. Tafadhali ikamilishe na uiweke \"tayari\", au wasiliana na mnunuzi.",
        "order.preorderOverdueBuyer.title": "Oda yako inachukua muda mrefu kuliko ilivyotarajiwa",
        "order.preorderOverdueBuyer.message": "Bidhaa yako maalum ya oda {orderNumber} imechelewa. Tumemkumbusha muuzaji.",

        "wallet.credited.title": "Pochi imeongezwa fedha",
        "wallet.credited.message": "Pochi yako imeongezwa fedha kwa ajili ya agizo #{orderId}.",
        "wallet.codCommissionDebited.title": "Kamisheni ya malipo ya mkononi imekatwa",
        "wallet.codCommissionDebited.message": "Kamisheni ya jukwaa kwa agizo la malipo ya mkononi #{orderId} imekatwa kutoka kwenye pochi yako.",
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

        "subscription.expiring.title": "Mpango wako wa muuzaji unakaribia kuisha",
        "subscription.expiring.message": "Mpango wako wa {planName} unaendelea hadi {date}. Hufanya upya kutoka dashibodi yako ya muuzaji ili kuendelea kupata manufaa yake.",
        "subscription.renewal.title": "Hufanya upya mpango wako wa muuzaji",
        "subscription.renewal.message": "Mpango wako wa {planName} unafanywa upya tarehe {date}. Lipa kutoka dashibodi yako ya muuzaji ili kuendelea kupata manufaa bila pengo.",
        "stock.low.title": "Bidhaa {count} zinakaribia kuisha",
        "stock.low.message": "Zinakaribia kuisha: {names}. Fungua Usimamizi wa Stoku ili kuagiza tena.",
        "stock.negative.title": "Mauzo yamefanya stoku iwe chini ya sifuri",
        "stock.negative.message": "Mauzo {receipt} yalirekodiwa bila mtandao kisha kusawazishwa. Hakiki stoku ya: {names}.",
        "trial.midway.title": "Jaribio lako la bure limebakiza siku 2",
        "trial.midway.message": "Jaribio lako la bure la siku 7 linaisha baada ya takriban siku 2. Chagua mpango kutoka dashibodi yako ya muuzaji ili kuendelea kutumia Uchambuzi, POS na huduma nyingine za mpango.",
        "trial.lastDay.title": "Siku ya mwisho ya jaribio lako la bure",
        "trial.lastDay.message": "Jaribio lako la bure linaisha ndani ya saa 24. Chagua mpango sasa ili kuendelea kutumia Uchambuzi, POS na huduma nyingine za mpango bila pengo.",
        "trial.expired.title": "Jaribio lako la bure limeisha",
        "trial.expired.message": "Jaribio limeisha - chagua mpango ili kuendelea kutumia Uchambuzi na POS. Unaweza kuendelea kuuza kwenye mpango wa Bure.",
        "trial.extended.title": "Jaribio lako la bure limeongezwa",
        "trial.extended.message": "Habari njema: jaribio lako la bure sasa linaendelea siku {days} zaidi."
    },

    otp: {
        channelName: { email: "barua pepe", sms: "SMS", whatsapp: "WhatsApp" },
        channelFailed: "Hatukuweza kutuma msimbo kupitia {channel}. Tafadhali chagua njia nyingine.",
        subject: {
            login: "Msimbo wako wa kuingia NEXORA",
            password_change: "Msimbo wako wa kubadilisha nenosiri la NEXORA",
            password_reset: "Msimbo wako wa kuweka upya nenosiri la NEXORA",
            default: "Msimbo wako wa uthibitisho wa NEXORA"
        },
        intro: {
            login: "Tumia msimbo huu kumaliza kuingia NEXORA:",
            password_change: "Tumia msimbo huu kuthibitisha kuwa ni wewe kabla ya kubadilisha nenosiri lako la NEXORA:",
            password_reset: "Tumia msimbo huu kuweka upya nenosiri lako la NEXORA:"
        },
        expiry: "Msimbo huu unaisha baada ya dakika {minutes}. Usipoomba msimbo huu, unaweza kupuuza ujumbe huu.",
        sms: "Msimbo wa NEXORA: {code}. Unaisha baada ya dakika {minutes}. Usimshirikishe mtu yeyote msimbo huu."
    },
    email: {
        cta: { view: "Tazama kwenye NEXORA" },
        supportLabel: "Unahitaji msaada? Wasiliana nasi",
        manageLabel: "Dhibiti barua pepe za arifa",
        footer: "Ujumbe huu umetumwa na NEXORA - jibu wakati wowote ukihitaji msaada.",
        tagline: "Soko la Tanzania",
        greetingPrefix: "Habari"
    }
};
