# oceanrise على Supabase — دليل التشغيل

## ما في الحزمة
```
index.html                         الواجهة (ملف واحد)
config.js                          رابط مشروعك ومفتاحه العام (تعدّله أنت)
supabase/migrations/001_schema.sql الجداول + الصلاحيات (RLS)
supabase/migrations/002_attachments.sql مخزن المرفقات الخاص (عروض الأسعار والفواتير والصور)
supabase/functions/login           الدخول بالرقم الوظيفي
supabase/functions/provision       إنشاء حساب / إعادة تعيين كلمة السر / حذف حساب
supabase/functions/change-password تغيير كلمة السر
supabase/functions/bootstrap       إنشاء أول مدير (مرة واحدة)
supabase/functions/_shared/util.ts كود مشترك
supabase/config.toml
```

## الخطوات (حوالي 15 دقيقة)

### 1) أنشئ المشروع
من supabase.com أنشئ مشروعاً جديداً، واحفظ كلمة سر قاعدة البيانات، واختر أقرب منطقة لك.

### 2) أنشئ الجداول والصلاحيات
Dashboard ← **SQL Editor** ← New query ← الصق محتوى `supabase/migrations/001_schema.sql` ← Run.
ثم شغّل بنفس الطريقة `002_attachments.sql` (مخزن المرفقات).
(شغّل كل ملف مرة واحدة فقط وبالترتيب.)

### 3) أغلق التسجيل العام (مهم)
Dashboard ← Authentication ← Sign In / Providers ← Email ← عطّل **Allow new users to sign up**.
بهذا لا يُنشئ الحسابات إلا النظام نفسه.

### 4) انشر الدوال
ثبّت Supabase CLI (https://supabase.com/docs/guides/cli) ثم من مجلد الحزمة:
```bash
supabase login
supabase link --project-ref <PROJECT_REF>        # الرمز من رابط المشروع
supabase functions deploy login provision change-password bootstrap --no-verify-jwt
supabase secrets set BOOTSTRAP_TOKEN=<اختر-سراً-طويلاً>
```
المفاتيح SUPABASE_URL وSUPABASE_ANON_KEY وSUPABASE_SERVICE_ROLE_KEY تُحقن في الدوال تلقائياً.

### 5) أنشئ أول مدير
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/bootstrap" \
  -H "apikey: <ANON_KEY>" -H "x-bootstrap-token: <BOOTSTRAP_TOKEN>"
```
يعيد `username: admin` وكلمة سر مؤقتة. (لا يعمل مرة ثانية بعد وجود أي مستخدم.)
بعدها يمكنك حذف السر: `supabase secrets unset BOOTSTRAP_TOKEN`.

### 6) اربط الواجهة
عدّل `config.js`:
```js
window.OR_CONFIG = { url: 'https://<PROJECT_REF>.supabase.co', anonKey: '<ANON_KEY>' };
```
المفتاح من Dashboard ← Project Settings ← API (المفتاح العام anon/publishable).
**لا تضع service_role هنا أبداً.**

### 7) شغّل
- للتجربة: افتح `index.html` مباشرة.
- للتشغيل الفعلي: ارفع `index.html` و`config.js` على أي استضافة ثابتة (Netlify أو Cloudflare Pages أو Vercel أو سيرفرك).

سجّل الدخول بـ `admin` وكلمة السر المؤقتة، واختر كلمة سر جديدة. بعدها:
أضف موظفاً من صفحة People ← يظهر لك اسم المستخدم (الرقم الوظيفي) وكلمة السر المولَّدة مرة واحدة ← سلّمها للموظف وسيُطلب منه تغييرها عند أول دخول.

## كيف تعمل الصلاحيات
- تُفرض داخل قاعدة البيانات (RLS)، وليس في الواجهة فقط. الموظف العادي يقرأ سجله وطلباته وطلبات الصيانة التي أنشأها فقط.
- مصفوفة الصلاحيات تُعدَّل من صفحة Users & Access (المدير العام).
- من لم يغيّر كلمة سره المؤقتة لا يستطيع قراءة أي بيانات.
- حذف موظف يعطّل حسابه تلقائياً.

## ملاحظات
- بريد وهمي داخلي: Supabase Auth يحتاج بريداً كمعرّف داخلي، فيُنشأ لكل حساب بريد تقني `…@oceanrise.internal` لا يراه أحد ولا تُرسل إليه رسائل. إذا رفضه Supabase (خطأ email_address_invalid) غيّر `INTERNAL_DOMAIN` في `supabase/functions/_shared/util.ts` إلى نطاق تملكه وأعد نشر الدوال.
- البيانات تُحدَّث تلقائياً كل 15 ثانية. إذا عدّل شخصان نفس السجل معاً فآخر حفظ هو الذي يبقى.
- الحد الأقصى المحمّل لكل جدول 10,000 سجل.
- في وضع Supabase أُخفي «استيراد JSON» و«إعادة ضبط كل البيانات» حمايةً من مسح البيانات.
- النسخ الاحتياطي: فعّل النسخ التلقائي في خطة مدفوعة، أو صدّر من Settings ← Export.
- تأكد من منطقة الخوادم ومتطلبات نظام حماية البيانات الشخصية قبل إدخال بيانات الموظفين الحقيقية.

## المرفقات
- تُرفع إلى مخزن خاص `attachments` (حتى 10 ميجابايت للملف، 6 ملفات للحقل). العرض والتنزيل عبر رابط مؤقت مدته 5 دقائق.
- الموظف يرى ملفاته فقط؛ عروض الأسعار والفواتير للموظفين الإداريين.
- في وضع التجربة (فتح الملف بدون Supabase) تُحفظ الملفات داخل المتصفح بحد 1.5 ميجابايت للملف.
