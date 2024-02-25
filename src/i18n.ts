import i18next from "i18next"
import enNs1 from './IETF/en/en.json' with { type: 'json' }
import ruNs1 from './IETF/ru/ru.json' with { type: 'json' }

export const defaultNS = 'ns1'
export const fallbackNS = 'fallback'

void i18next.init({
    debug: false,
    fallbackLng: 'ru',
    defaultNS,
    fallbackNS,
    resources: {
        en: {
            ns1: enNs1,
        },
        ru: {
            ns1: ruNs1,
        },
    },
})

export default i18next
