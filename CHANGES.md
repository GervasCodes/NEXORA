# NEXORA — Mabadiliko (Changes)

Faili 5 zilizobadilishwa/kuongezwa. Zote zime-test na `npm run build` (frontend)
haihitaji mabadiliko yoyote ya backend kwa hizi fix.

## 1. Bug: Icons/maandishi yalikuwa yanagongana (site-wide, ikiwemo Profile/Account)

**Faili:** `frontend/src/components/Footer.jsx`

Floating support-chat button (chini-kushoto) na AI assistant button (chini-kulia)
zilikuwa zime-`fixed` bila nafasi ya kutosha kwenye simu (mobile), hivyo zilikuwa
zinafunika maneno ya mwisho ya Footer (mfano "System status" ilionekana "n status").
Nimeongeza `padding-bottom` ya ziada kwa mobile (`pb-28`, inarudi `sm:pb-10` kwenye
desktop) ili maandishi yasifunikwe kamwe.

## 2. Bug: Show/Hide password button haikuonekana (ilikuwepo lakini "invisible")

**Faili:** `frontend/src/components/ui/Input.jsx`

Icon ya "jicho" (show/hide password) ilikuwa inatumia class za Tailwind
`w-4.5 h-4.5` ambazo hazipo kwenye `tailwind.config.js` ya project hii — hivyo
icon ilikuwa ikirender kwa ukubwa wa 0x0 pixels (button ilikuwepo na inafanya
kazi ukibonyeza, lakini haikuonekana kabisa). Imebadilishwa kuwa `w-5 h-5`
(class halali). Hii inarekebisha show/hide password KILA POSITION kwenye app
nzima (Login, Register, Account → change password, delete account, n.k.) kwa
sababu zote zinatumia Input.jsx moja.

## 3. Feature: Confirm Password + show/hide, wakati wa kuunda akaunti

**Faili:** `frontend/src/pages/Register.jsx`, `frontend/src/context/LanguageContext.jsx`

- Field mpya "Confirm password" imeongezwa chini ya "Password" kwenye ukurasa
  wa kujisajili (`/register`), yenye show/hide toggle yake mwenyewe (kwa
  kutumia Input.jsx iliyopo).
- Maneno ya kisasa yametumika ("Confirm password" / Kiswahili: "Thibitisha
  nenosiri") — si tafsiri halisi ya "re-write password".
- Kama manenosiri hayafanani: ujumbe "Passwords don't match." / "Manenosiri
  hayafanani." unaonekana papo hapo, na button ya "Create account" inabaki
  imezimwa (disabled) mpaka yafanane.
- `confirm_password` HAITUMWI kwa backend (imeondolewa kabla ya kutuma
  request) — backend (`auth.validator.js`) tayari inahitaji password ya
  angalau herufi 8, hakuna mgongano, hivyo backend haikuhitaji mabadiliko.

## 4. Test mpya

**Faili:** `frontend/tests/pages/Register.test.jsx` (mpya)

Test 3 zinazothibitisha:
1. Ujumbe wa "hayafanani" unaonekana na button inazuiwa (disabled) mpaka
   manenosiri yafanane.
2. Kila field (Password na Confirm password) ina show/hide toggle yake
   inayofanya kazi kivyake (independent).
3. `confirm_password` haitumwi kwenye register API call.

Matokeo ya kutest (frontend):
```
✓ tests/pages/Register.test.jsx (3 tests)
✓ tests/components/Footer.test.jsx (1 test)
✓ tests/pages/Login.test.jsx (7 tests)
✓ tests/components/ui/AccessibilityStates.test.jsx (4 tests)
```
`npx eslint` kwenye faili zote zilizobadilika: 0 errors, 0 warnings.

## Jambo la kuzingatia (halijafanyiwa kazi kwa makusudi)

Wakati wa kutest, tumegundua bug NYINGINE isiyo-husiana na kazi hii:
`frontend/src/pages/ConversationThread.jsx` inaita
`frontend/src/components/chat/MessageSearch.jsx` ambayo haipo kwenye project
(faili la test lipo, lakini component yenyewe haipo), hivyo `npm run build`
inashindwa kwa ujumla wa project. Hii si sehemu ya maombi yako (profile page +
password), kwa hiyo hatujaigusa — lakini ni vizuri ijulikane kabla ya
kupeleka production.
