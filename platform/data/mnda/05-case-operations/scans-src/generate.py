"""
Generates the scanned application documents for solution 05 as HTML, ready to be rendered to PNG
with headless Chrome (see render.sh). All people, numbers and organisations are fictional (WORLD.md).
Identity-document lookalikes carry a SPECIMEN watermark.
"""
import os, sys, json

OUT = os.path.dirname(os.path.abspath(__file__))

FONTS = '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600&family=Inter:wght@300;400;500;600&family=Amiri:wght@400;700&family=Aref+Ruqaa&family=Reem+Kufi:wght@500&display=block" rel="stylesheet">'

BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1100px;height:1556px;background:#dcd8d0}
body{font-family:Inter,'IBM Plex Sans Arabic',sans-serif;color:#1d1c1a;display:flex;align-items:center;justify-content:center}
.page{width:1040px;height:1500px;background:#fefdfa;position:relative;padding:64px 70px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,.18)}
.ar{font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl}
.amiri{font-family:Amiri,serif}
.grain:after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;
 background-image:radial-gradient(rgba(0,0,0,.06) 1px,transparent 1px);background-size:4px 4px}
.scan{transform:rotate(-0.55deg);filter:contrast(1.04) saturate(.9)}
.row{display:flex;justify-content:space-between;align-items:flex-start}
.muted{color:#6b665d}
.small{font-size:13px}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #bdb7ab;padding:9px 11px;font-size:15px;vertical-align:top}
th{background:#f1eee7;font-weight:500;text-align:start}
.stamp{position:absolute;width:150px;height:150px;border:3px solid rgba(31,79,140,.72);border-radius:50%;
 color:rgba(31,79,140,.78);display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;
 font-weight:600;line-height:1.3;transform:rotate(-14deg)}
.stamp:before{content:"";position:absolute;inset:8px;border:1.5px solid rgba(31,79,140,.6);border-radius:50%}
.specimen{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.specimen span{transform:rotate(-28deg);font-size:120px;font-weight:600;letter-spacing:.08em;color:rgba(190,40,30,.16);white-space:nowrap}
.specimen small{position:absolute;bottom:40px;font-size:15px;color:rgba(190,40,30,.55);letter-spacing:.2em}
"""

SIGNATURE = '<svg width="190" height="70" viewBox="0 0 190 70"><path d="M8 48 C 22 10, 38 62, 52 30 S 78 8, 86 40 S 112 66, 122 28 C 128 12, 140 54, 152 36 S 174 22, 184 30" fill="none" stroke="#1b2f6b" stroke-width="2.4" stroke-linecap="round"/><path d="M40 58 L 150 52" stroke="#1b2f6b" stroke-width="1.4" fill="none"/></svg>'


def mnda_letterhead(dept_en, dept_ar):
    return f"""
<div class="row" style="border-bottom:2px solid #1d4f47;padding-bottom:18px">
  <div style="display:flex;gap:14px;align-items:center">
    <div style="width:58px;height:58px;background:#1d4f47;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:20px;letter-spacing:.04em">MN</div>
    <div><div style="font-size:19px;font-weight:600;color:#1d4f47">Marsa Al Noor Development Authority</div>
    <div class="small muted">{dept_en}</div></div>
  </div>
  <div class="ar" style="text-align:right"><div style="font-size:20px;font-weight:600;color:#1d4f47">هيئة مرسى النور للتطوير</div>
  <div class="small muted">{dept_ar}</div></div>
</div>"""


def page(body, cls="grain", extra_css=""):
    return f"""<!doctype html><html><head><meta charset="utf-8">{FONTS}<style>{BASE_CSS}{extra_css}</style></head>
<body><div class="page {cls}">{body}</div></body></html>"""


def specimen():
    return '<div class="specimen"><span>SPECIMEN</span><small>DEMO DATA — NOT A REAL DOCUMENT · بيانات تجريبية</small></div>'


# ─────────────────────────── documents ───────────────────────────

def app_form_digital(c):
    a = c["a"]
    chk = lambda b: "☑" if b else "☐"
    rows = "".join(
        f'<tr><th style="width:34%">{k}</th><td>{v}</td></tr>' for k, v in [
            ("Full name / الاسم الكامل", f'{a["name"]}<br><span class="ar">{a["nameAr"]}</span>'),
            ("Emirates ID / رقم الهوية", a["eid"]),
            ("Mobile / الهاتف المتحرك", a["mobile"]),
            ("Email / البريد الإلكتروني", a["email"]),
            ("Marital status / الحالة الاجتماعية", a["marital"]),
            ("Spouse / الزوج أو الزوجة", a.get("spouse", "—")),
            ("Dependents / عدد المعالين", str(a["dependents"])),
            ("Employer / جهة العمل", a["employer"]),
            ("Declared monthly household income / الدخل الشهري المصرّح به", f'AED {a["income"]:,}'),
        ])
    req = "".join(
        f'<tr><th style="width:34%">{k}</th><td>{v}</td></tr>' for k, v in [
            ("Programme track / المسار", f'{chk(c["track"]=="grant")} Housing Grant / منحة سكنية &nbsp;&nbsp; {chk(c["track"]=="loan")} Housing Loan / قرض سكني'),
            ("Amount requested / المبلغ المطلوب", f'AED {c["amount"]:,}'),
            ("Purpose / الغرض", c["purpose"]),
            ("District · Plot / المنطقة · رقم الأرض", f'{c["district"]} · {c["plot"]}'),
        ])
    att = "".join(f"<li>{x}</li>" for x in c["attached"])
    return page(f"""
{mnda_letterhead("Housing & Community Services · Housing Grant & Loan Programme", "إدارة الإسكان وخدمات المجتمع · برنامج المنح والقروض السكنية")}
<div class="row" style="margin-top:26px">
  <div><div style="font-size:24px;font-weight:300">Housing Grant & Loan Application</div>
  <div class="ar" style="font-size:20px;margin-top:2px">طلب منحة / قرض سكني</div></div>
  <div style="text-align:right" class="small">
    <div><b>Form</b> MNDA-HC-F01 · rev. 09/2026</div>
    <div><b>Application no.</b> {c["id"]}</div>
    <div><b>Submitted</b> {c["submitted"]} · {c["channel"]}</div>
  </div>
</div>
<div style="margin-top:22px;font-size:12px;letter-spacing:.14em;color:#6b665d">1 · APPLICANT · بيانات المتقدم</div>
<table style="margin-top:8px">{rows}</table>
<div style="margin-top:20px;font-size:12px;letter-spacing:.14em;color:#6b665d">2 · REQUEST · بيانات الطلب</div>
<table style="margin-top:8px">{req}</table>
<div style="margin-top:20px;font-size:12px;letter-spacing:.14em;color:#6b665d">3 · ATTACHMENTS UPLOADED · المرفقات</div>
<ol style="margin:10px 0 0 22px;font-size:15px;line-height:1.7">{att}</ol>
<div style="margin-top:18px;font-size:12px;letter-spacing:.14em;color:#6b665d">4 · DECLARATIONS · الإقرارات</div>
<div style="font-size:14.5px;line-height:1.65;margin-top:8px">
 {chk(True)} I declare that the information provided is true and complete. / أقر بصحة واكتمال البيانات المقدمة.<br>
 {chk(c["consent"])} I consent to MNDA obtaining my Certificate of No Property Ownership directly from the Marsa Al Noor Land Registry. /
 <span class="ar">أوافق على أن تستخرج الهيئة شهادة عدم ملكية العقار مباشرة من سجل الأراضي.</span>
</div>
<div class="row" style="margin-top:26px;align-items:flex-end">
  <div class="small muted">Electronically signed via UAE PASS-style app signature · {c["submitted"]}<br>Generated by MNDA Smart — page 1 of 1</div>
  <div style="text-align:center">{SIGNATURE}<div class="small muted">{a["name"]}</div></div>
</div>
""", cls="")


def app_form_paper(c):
    a = c["a"]
    hand = "font-family:'Aref Ruqaa',serif;color:#1b2f6b;font-size:23px"
    hand_en = "font-family:'Inter';color:#1b2f6b;font-size:17px;font-style:italic"
    line = lambda label_ar, label_en, val, ar=True: f"""
<div style="display:flex;gap:14px;align-items:flex-end;margin-top:14px">
 <div class="ar" style="width:270px;font-size:15px">{label_ar}<div class="muted" style="font-size:12px;direction:ltr;text-align:right">{label_en}</div></div>
 <div style="flex:1;border-bottom:1px dotted #8d877b;padding:0 8px 2px;{hand if ar else hand_en};text-align:right" dir="{'rtl' if ar else 'ltr'}">{val}</div>
</div>"""
    body = f"""
{mnda_letterhead("Housing & Community Services · Customer Happiness Centre — Al Murjan", "إدارة الإسكان وخدمات المجتمع · مركز إسعاد المتعاملين — المرجان")}
<div class="ar" style="margin-top:22px;text-align:center;font-size:25px;font-weight:600">نموذج طلب منحة / قرض سكني</div>
<div style="text-align:center;font-size:14px" class="muted">Housing Grant & Loan Application — Form MNDA-HC-F01 (paper)</div>
<div style="display:flex;justify-content:space-between;margin-top:10px" class="small"><span>Received: {c["submitted"]}</span><span>Ref. {c["id"]}</span></div>
{line("الاسم الكامل", "Full name", a["nameAr"])}
{line("رقم الهوية", "Emirates ID", a["eid"], ar=False)}
{line("رقم الهاتف المتحرك", "Mobile", a["mobile"], ar=False)}
{line("الحالة الاجتماعية", "Marital status", "متزوجة")}
{line("اسم الزوج", "Spouse", a.get("spouseAr", ""))}
{line("عدد الأبناء / المعالين", "Dependents", "٥ (خمسة)")}
{line("جهة العمل", "Employer", "مجلس التعليم — مدرسة المرجان للبنات")}
{line("الدخل الشهري للأسرة (درهم)", "Monthly household income (AED)", "28,500", ar=False)}
{line("دخل الزوج", "Spouse income", "لا يعمل")}
{line("المسار المطلوب", "Track", "منحة سكنية ✔")}
{line("رقم الأرض", "Plot no.", c["plot"], ar=False)}
<div class="ar" style="margin-top:26px;font-size:15px;line-height:1.9">
 المرفقات: صورة الهوية — صورة هوية الزوج — خلاصة القيد كاملة — شهادة راتب — شهادة عدم ملكية عقار<br>
 ☐ أوافق على استخراج شهادة عدم ملكية العقار من سجل الأراضي مباشرة <span class="muted small">(لم يتم التأشير)</span><br>
 ☑ أقر بصحة البيانات الواردة أعلاه
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px">
 <div style="width:330px;border:1px solid #bdb7ab;padding:12px;font-size:13px" class="ar">لاستخدام الموظف فقط<br><span class="muted">استلم بواسطة: موظف خدمة المتعاملين — المرجان</span><br><span class="muted">التاريخ: {c["submitted"]}</span></div>
 <div style="text-align:center">{SIGNATURE}<div class="ar small muted">توقيع المتقدم</div></div>
</div>
<div class="stamp" style="left:120px;bottom:90px">MNDA<br>CUSTOMER<br>HAPPINESS<br>AL MURJAN<br>RECEIVED</div>
"""
    return page(body, cls="grain scan", extra_css=".page{background:#fbf8f1}")


def emirates_id(p):
    body = f"""
<div style="margin:120px auto 0;width:860px;height:540px;border-radius:26px;background:linear-gradient(135deg,#eef1ec,#e3e8e6);border:1px solid #c6cbc6;position:relative;padding:40px 46px;overflow:hidden">
 <div class="row"><div style="font-size:15px;letter-spacing:.2em;color:#4b5b56">RESIDENT IDENTITY CARD — DEMO</div><div class="ar" style="font-size:18px;color:#4b5b56">بطاقة هوية — نموذج تجريبي</div></div>
 <div style="display:flex;gap:36px;margin-top:40px">
  <div style="width:200px;height:250px;background:#cfd6d3;border-radius:10px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden">
   <svg width="170" height="210" viewBox="0 0 170 210"><circle cx="85" cy="78" r="44" fill="#aab4b0"/><path d="M10 210 C 20 140, 150 140, 160 210 Z" fill="#aab4b0"/></svg></div>
  <div style="flex:1;font-size:18px;line-height:2">
   <div><span class="muted small">ID Number</span><br><b style="font-size:24px;letter-spacing:.06em">{p["eid"]}</b></div>
   <div><span class="muted small">Name</span> &nbsp; {p["name"]}</div>
   <div class="ar" style="text-align:left"><span class="muted small">الاسم</span> &nbsp; {p["nameAr"]}</div>
   <div><span class="muted small">Nationality</span> &nbsp; {p.get("nat","United Arab Emirates")}</div>
   <div><span class="muted small">Expiry</span> &nbsp; {p["expiry"]}</div>
  </div>
 </div>
</div>
<div style="text-align:center;margin-top:46px" class="small muted">Copy uploaded by applicant · front side</div>
{specimen()}"""
    return page(body, cls="grain")


def family_book(f):
    members = "".join(
        f'<tr><td>{m[0]}</td><td class="ar">{m[1]}</td><td>{m[2]}</td><td>{m[3]}</td></tr>' for m in f["members"])
    body = f"""
<div class="row"><div><div style="font-size:22px;font-weight:300">Family Book Extract</div><div class="small muted">Family register copy — all pages · DEMO</div></div>
<div class="ar" style="font-size:22px">خلاصة القيد — نسخة تجريبية</div></div>
<table style="margin-top:28px"><tr><th>Family no.</th><td>{f["no"]}</td><th>Emirate / Town</th><td>Marsa Al Noor</td></tr>
<tr><th>Head of family</th><td colspan="3">{f["head"]} — <span class="ar">{f["headAr"]}</span></td></tr></table>
<table style="margin-top:22px"><tr><th>Relation</th><th>Name (Arabic)</th><th>Date of birth</th><th>Emirates ID</th></tr>{members}</table>
<div class="small muted" style="margin-top:16px">Pages included: {f["pages"]}</div>
{specimen()}"""
    return page(body, cls="grain scan")


def salary_certificate(s):
    rows = "".join(f'<tr><td>{k}</td><td class="ar" style="text-align:right">{ka}</td><td style="text-align:right">AED {v:,}</td></tr>' for k, ka, v in s["lines"])
    total = sum(v for _, _, v in s["lines"])
    head = s["letterhead"]
    body = f"""
{head}
<div class="row" style="margin-top:26px" ><div class="small">Ref: {s["ref"]}<br>Date: {s["date"]}</div><div class="ar small" style="text-align:right">الرقم: {s["ref"]}<br>التاريخ: {s["dateAr"]}</div></div>
<div style="text-align:center;margin-top:30px"><div style="font-size:24px;font-weight:300">Salary Certificate — To Whom It May Concern</div><div class="ar" style="font-size:22px;margin-top:4px">شهادة راتب — إلى من يهمه الأمر</div></div>
<p style="margin-top:28px;font-size:16px;line-height:1.75">This is to certify that <b>{s["name"]}</b>, holder of Emirates ID <b>{s["eid"]}</b>, has been employed by {s["employer"]} since <b>{s["since"]}</b> as <b>{s["position"]}</b> (Grade {s["grade"]}). The employee's current monthly salary is as follows:</p>
<p class="ar" style="margin-top:12px;font-size:17px;line-height:1.9">نفيد بأن السيد/ة <b>{s["nameAr"]}</b> يعمل لدينا منذ <b>{s["sinceAr"]}</b> بوظيفة <b>{s["positionAr"]}</b>، ويتقاضى راتباً شهرياً على النحو التالي:</p>
<table style="margin-top:18px"><tr><th>Component</th><th class="ar" style="text-align:right">البند</th><th style="text-align:right">Monthly</th></tr>{rows}
<tr><th>Total monthly salary</th><th class="ar" style="text-align:right">إجمالي الراتب الشهري</th><th style="text-align:right">AED {total:,}</th></tr></table>
<p style="margin-top:22px;font-size:15px;line-height:1.7" class="muted">This certificate is issued at the employee's request without any liability on the employer.<br><span class="ar">أعطيت هذه الشهادة بناءً على طلب الموظف دون أدنى مسؤولية على الجهة.</span></p>
<div class="row" style="margin-top:46px;align-items:flex-end"><div>{SIGNATURE}<div style="font-size:15px">{s["signer"]}</div><div class="small muted">{s["signerTitle"]}</div></div></div>
<div class="stamp" style="right:150px;bottom:210px">{s["stamp"]}</div>"""
    return page(body, cls="grain scan")


def plot_letter(p):
    body = f"""
{mnda_letterhead("Housing & Community Services · Land Allocation Section", "إدارة الإسكان وخدمات المجتمع · قسم تخصيص الأراضي")}
<div class="row" style="margin-top:26px"><div class="small">Ref: {p["ref"]}<br>Date: {p["date"]}</div><div class="ar small" style="text-align:right">الرقم: {p["ref"]}</div></div>
<div style="margin-top:28px;font-size:22px;font-weight:300">Residential Plot Allocation Letter</div><div class="ar" style="font-size:20px">خطاب تخصيص أرض سكنية</div>
<p style="margin-top:24px;font-size:16px;line-height:1.75">Dear {p["name"]},<br>We are pleased to confirm the allocation of the following residential plot under the Citizens' Residential Land Programme:</p>
<table style="margin-top:16px"><tr><th>Plot number</th><td>{p["plot"]}</td></tr><tr><th>District</th><td>{p["district"]}</td></tr>
<tr><th>Plot area</th><td>{p["area"]} m²</td></tr><tr><th>Permitted use</th><td>Private residential villa (G+1)</td></tr><tr><th>Allocation date</th><td>{p["allocated"]}</td></tr></table>
<p style="margin-top:18px;font-size:15px;line-height:1.7" class="muted">Construction must start within 5 years of allocation. A building permit (MNDA-SVC-101) is required before any works.</p>
<div style="margin-top:40px">{SIGNATURE}<div>Fatima Obaid Al Nuaimi</div><div class="small muted">Director, Housing & Community Services</div></div>
<div class="stamp" style="right:140px;bottom:220px">MNDA<br>HOUSING &<br>COMMUNITY<br>SERVICES</div>"""
    return page(body, cls="grain scan")


def no_property(n):
    body = f"""
<div class="row" style="border-bottom:2px solid #5a4a2a;padding-bottom:18px">
 <div style="display:flex;gap:14px;align-items:center"><div style="width:58px;height:58px;border:2px solid #5a4a2a;color:#5a4a2a;display:flex;align-items:center;justify-content:center;font-weight:600">LR</div>
 <div><div style="font-size:19px;font-weight:600;color:#5a4a2a">Marsa Al Noor Land Registry</div><div class="small muted">Department of Real Estate Records</div></div></div>
 <div class="ar" style="text-align:right"><div style="font-size:20px;font-weight:600;color:#5a4a2a">سجل الأراضي — مرسى النور</div><div class="small muted">إدارة السجلات العقارية</div></div></div>
<div style="margin-top:34px;text-align:center"><div style="font-size:24px;font-weight:300">Certificate of No Property Ownership</div><div class="ar" style="font-size:22px">شهادة عدم ملكية عقار</div></div>
<table style="margin-top:28px"><tr><th>Certificate no.</th><td>{n["no"]}</td></tr><tr><th>Issued</th><td>{n["date"]}</td></tr>
<tr><th>Name</th><td>{n["name"]} — <span class="ar">{n["nameAr"]}</span></td></tr><tr><th>Emirates ID</th><td>{n["eid"]}</td></tr>
<tr><th>Result</th><td>No residential property is registered in the name of the above person in the Marsa Al Noor Land Registry as of the date of issue.</td></tr>
<tr><th>Validity</th><td>60 days from the date of issue</td></tr></table>
<p class="ar" style="margin-top:20px;font-size:16px;line-height:1.9">نشهد بأنه لا توجد أي عقارات سكنية مسجلة باسم المذكور أعلاه في سجل الأراضي بمرسى النور حتى تاريخ إصدار هذه الشهادة.</p>
<div style="margin-top:36px">{SIGNATURE}<div class="small muted">Registrar · أمين السجل</div></div>
<div class="stamp" style="right:150px;bottom:230px;border-color:rgba(90,74,42,.7);color:rgba(90,74,42,.8)">LAND<br>REGISTRY<br>MARSA<br>AL NOOR</div>"""
    return page(body, cls="grain scan")


def bank_statement(b):
    rows = "".join(f"<tr><td>{d}</td><td>{t}</td><td style='text-align:right'>{cr}</td><td style='text-align:right'>{bal}</td></tr>" for d, t, cr, bal in b["rows"])
    body = f"""
<div class="row" style="border-bottom:2px solid #22324f;padding-bottom:16px"><div><div style="font-size:21px;font-weight:600;color:#22324f">Al Noor National Bank</div><div class="small muted">Account statement summary · 6 months</div></div><div class="ar" style="font-size:19px;color:#22324f">بنك النور الوطني</div></div>
<table style="margin-top:22px"><tr><th>Account holder</th><td>{b["name"]}</td><th>Account</th><td>{b["acct"]}</td></tr><tr><th>Period</th><td colspan="3">{b["period"]}</td></tr></table>
<table style="margin-top:20px"><tr><th>Date</th><th>Description</th><th style="text-align:right">Credit (AED)</th><th style="text-align:right">Balance (AED)</th></tr>{rows}</table>
<p class="small muted" style="margin-top:14px">Salary credits only shown in this summary. Full statement available on request.</p>
<div class="stamp" style="right:140px;bottom:200px;border-color:rgba(34,50,79,.7);color:rgba(34,50,79,.8)">AL NOOR<br>NATIONAL<br>BANK<br>VERIFIED</div>"""
    return page(body, cls="grain scan")


# ─────────────────────────── case data ───────────────────────────

def mnda_hr_head():
    return mnda_letterhead("Human Capital Department", "إدارة رأس المال البشري")


def edu_head():
    return """<div class="row" style="border-bottom:2px solid #6b3f2a;padding-bottom:18px"><div><div style="font-size:19px;font-weight:600;color:#6b3f2a">Marsa Al Noor Education Council</div><div class="small muted">Human Resources · Al Murjan Girls School</div></div><div class="ar" style="text-align:right;font-size:20px;font-weight:600;color:#6b3f2a">مجلس التعليم — مرسى النور</div></div>"""


def ports_head():
    return """<div class="row" style="border-bottom:2px solid #13436b;padding-bottom:18px"><div><div style="font-size:19px;font-weight:600;color:#13436b">Marsa Al Noor Ports Company PJSC</div><div class="small muted">Human Resources Division</div></div><div class="ar" style="text-align:right;font-size:20px;font-weight:600;color:#13436b">شركة موانئ مرسى النور</div></div>"""


DOCS = {}

# 005203 — Obaid Hamad Al Ketbi (salary certificate older than 30 days, income difference > 5%, no-property certificate not attached but consent given)
o = {"name": "Obaid Hamad Al Ketbi", "nameAr": "عبيد حمد الكتبي", "eid": "784-1991-6630417-2", "mobile": "+971 52 338 6104",
     "email": "obaid.alketbi91@gmail.com", "marital": "Married / متزوج", "spouse": "Shaikha Saeed Al Ketbi — شيخة سعيد الكتبي",
     "dependents": 2, "employer": "Marsa Al Noor Development Authority — Field Operations & Inspection", "income": 26900}
DOCS["005203/application-form"] = app_form_digital({"id": "MNDA-HG-2026-005203", "a": o, "track": "grant", "amount": 600000,
    "purpose": "Construction of first family home / بناء المسكن الأول للأسرة", "district": "MN-04 Al Waha Gardens", "plot": "MN-04-117-0031",
    "submitted": "06 Oct 2026, 09:14", "channel": "MNDA Smart app", "consent": True,
    "attached": ["Emirates ID — applicant", "Emirates ID — spouse", "Family Book — all pages", "Salary certificate", "Plot allocation letter"]})
DOCS["005203/eid-applicant"] = emirates_id({"eid": "784-1991-6630417-2", "name": "Obaid Hamad Al Ketbi", "nameAr": "عبيد حمد الكتبي", "expiry": "14/03/2029"})
DOCS["005203/eid-spouse"] = emirates_id({"eid": "784-1994-2081736-9", "name": "Shaikha Saeed Al Ketbi", "nameAr": "شيخة سعيد الكتبي", "expiry": "02/11/2028"})
DOCS["005203/family-book"] = family_book({"no": "MN-21877", "head": "Obaid Hamad Al Ketbi", "headAr": "عبيد حمد الكتبي", "pages": "1–4 (head of family, wife, children)",
    "members": [("Head of family", "عبيد حمد الكتبي", "17/05/1991", "784-1991-6630417-2"), ("Wife", "شيخة سعيد الكتبي", "09/01/1994", "784-1994-2081736-9"),
                ("Son", "حمد عبيد الكتبي", "22/08/2019", "784-2019-5513820-1"), ("Daughter", "مريم عبيد الكتبي", "03/02/2023", "784-2023-0912287-4")]})
DOCS["005203/salary-certificate"] = salary_certificate({"letterhead": mnda_hr_head(), "ref": "MNDA/HC/SC/2026/3318", "date": "28 August 2026", "dateAr": "28 أغسطس 2026",
    "name": "Obaid Hamad Al Ketbi", "nameAr": "عبيد حمد الكتبي", "eid": "784-1991-6630417-2", "employer": "Marsa Al Noor Development Authority",
    "since": "4 September 2016", "sinceAr": "4 سبتمبر 2016", "position": "Building Inspector II, Field Operations & Inspection", "positionAr": "مفتش مبانٍ ثانٍ — إدارة العمليات الميدانية والتفتيش",
    "grade": "7", "lines": [("Basic salary", "الراتب الأساسي", 13250), ("Housing allowance", "علاوة السكن", 6625), ("Transport allowance", "علاوة المواصلات", 1500),
                            ("Social allowance", "العلاوة الاجتماعية", 2400), ("Field duty allowance", "علاوة العمل الميداني", 1475)],
    "signer": "Maryam Hassan Al Shamsi", "signerTitle": "Director, Human Capital", "stamp": "MNDA<br>HUMAN<br>CAPITAL<br>DEPT"})
DOCS["005203/plot-allocation"] = plot_letter({"ref": "MNDA/HCS/LA/2024/1187", "date": "11 March 2024", "name": "Obaid Hamad Al Ketbi", "plot": "MN-04-117-0031",
    "district": "MN-04 Al Waha Gardens", "area": "1,150", "allocated": "11 March 2024"})

# 005219 — Latifa Ali Al Zaabi (paper form; certified income above the grant ceiling; declared income differs > 5%)
l = {"name": "Latifa Ali Al Zaabi", "nameAr": "لطيفة علي الزعابي", "eid": "784-1987-1185903-6", "mobile": "+971 54 660 2871", "spouseAr": "حمد خميس الزعابي"}
DOCS["005219/application-form"] = app_form_paper({"id": "MNDA-HG-2026-005219", "a": l, "plot": "MN-02-051-0207", "submitted": "07/10/2026"})
DOCS["005219/eid-applicant"] = emirates_id({"eid": "784-1987-1185903-6", "name": "Latifa Ali Al Zaabi", "nameAr": "لطيفة علي الزعابي", "expiry": "30/06/2028"})
DOCS["005219/eid-spouse"] = emirates_id({"eid": "784-1983-7720154-3", "name": "Hamad Khamis Al Zaabi", "nameAr": "حمد خميس الزعابي", "expiry": "18/12/2027"})
DOCS["005219/family-book"] = family_book({"no": "MN-14320", "head": "Hamad Khamis Al Zaabi", "headAr": "حمد خميس الزعابي", "pages": "1–5 (all pages)",
    "members": [("Head of family", "حمد خميس الزعابي", "02/04/1983", "784-1983-7720154-3"), ("Wife", "لطيفة علي الزعابي", "11/10/1987", "784-1987-1185903-6"),
                ("Son", "خميس حمد الزعابي", "14/09/2010", "784-2010-3348115-0"), ("Daughter", "عائشة حمد الزعابي", "05/06/2012", "784-2012-6629304-8"),
                ("Son", "علي حمد الزعابي", "21/01/2015", "784-2015-1170482-6"), ("Daughter", "شمّة حمد الزعابي", "08/08/2018", "784-2018-9905213-2"),
                ("Son", "سالم حمد الزعابي", "30/11/2021", "784-2021-4417760-9")]})
DOCS["005219/salary-certificate"] = salary_certificate({"letterhead": edu_head(), "ref": "MNEC/HR/2026/10-0412", "date": "1 October 2026", "dateAr": "1 أكتوبر 2026",
    "name": "Latifa Ali Al Zaabi", "nameAr": "لطيفة علي الزعابي", "eid": "784-1987-1185903-6", "employer": "Marsa Al Noor Education Council",
    "since": "1 September 2011", "sinceAr": "1 سبتمبر 2011", "position": "Senior Teacher — Mathematics, Al Murjan Girls School", "positionAr": "معلمة أولى — رياضيات، مدرسة المرجان للبنات",
    "grade": "9", "lines": [("Basic salary", "الراتب الأساسي", 15600), ("Housing allowance", "علاوة السكن", 7800), ("Children allowance", "علاوة الأبناء", 3000),
                            ("Teaching allowance", "علاوة التدريس", 2950), ("Transport allowance", "علاوة المواصلات", 1600)],
    "signer": "Asma Rashid Al Hammadi", "signerTitle": "HR Manager", "stamp": "EDUCATION<br>COUNCIL<br>HUMAN<br>RESOURCES"})
DOCS["005219/no-property"] = no_property({"no": "LR-NPC-2026-077412", "date": "1 October 2026", "name": "Latifa Ali Al Zaabi", "nameAr": "لطيفة علي الزعابي", "eid": "784-1987-1185903-6"})

# 005231 — Salama Juma Al Neyadi (complete, valid file — loan track)
s = {"name": "Salama Juma Al Neyadi", "nameAr": "سلامة جمعة النيادي", "eid": "784-1993-4418820-7", "mobile": "+971 50 239 7718",
     "email": "salama.alneyadi@gmail.com", "marital": "Married / متزوجة", "spouse": "Rashid Mohammed Al Neyadi — راشد محمد النيادي",
     "dependents": 1, "employer": "Marsa Al Noor Ports Company PJSC", "income": 38400}
DOCS["005231/application-form"] = app_form_digital({"id": "MNDA-HG-2026-005231", "a": s, "track": "loan", "amount": 780000,
    "purpose": "Construction of first family home / بناء المسكن الأول للأسرة", "district": "MN-04 Al Waha Gardens", "plot": "MN-04-122-0009",
    "submitted": "08 Oct 2026, 08:05", "channel": "MNDA Smart app", "consent": True,
    "attached": ["Emirates ID — applicant", "Emirates ID — spouse", "Family Book — all pages", "Salary certificate", "Bank statement — 6 months",
                 "Certificate of No Property Ownership", "Plot allocation letter"]})
DOCS["005231/eid-applicant"] = emirates_id({"eid": "784-1993-4418820-7", "name": "Salama Juma Al Neyadi", "nameAr": "سلامة جمعة النيادي", "expiry": "21/07/2030"})
DOCS["005231/eid-spouse"] = emirates_id({"eid": "784-1990-3302917-5", "name": "Rashid Mohammed Al Neyadi", "nameAr": "راشد محمد النيادي", "expiry": "09/04/2029"})
DOCS["005231/family-book"] = family_book({"no": "MN-30114", "head": "Rashid Mohammed Al Neyadi", "headAr": "راشد محمد النيادي", "pages": "1–3 (all pages)",
    "members": [("Head of family", "راشد محمد النيادي", "12/12/1990", "784-1990-3302917-5"), ("Wife", "سلامة جمعة النيادي", "26/03/1993", "784-1993-4418820-7"),
                ("Daughter", "حصة راشد النيادي", "17/07/2024", "784-2024-2287661-3")]})
DOCS["005231/salary-certificate"] = salary_certificate({"letterhead": ports_head(), "ref": "MNPC/HR/CERT/26-5521", "date": "29 September 2026", "dateAr": "29 سبتمبر 2026",
    "name": "Salama Juma Al Neyadi", "nameAr": "سلامة جمعة النيادي", "eid": "784-1993-4418820-7", "employer": "Marsa Al Noor Ports Company PJSC",
    "since": "15 January 2017", "sinceAr": "15 يناير 2017", "position": "Logistics Planning Specialist", "positionAr": "أخصائية تخطيط لوجستي",
    "grade": "C3", "lines": [("Basic salary", "الراتب الأساسي", 19800), ("Housing allowance", "علاوة السكن", 9900), ("Transport allowance", "علاوة المواصلات", 2200),
                             ("Other allowances", "علاوات أخرى", 6500)],
    "signer": "Khaled Abdulrahman Al Marri", "signerTitle": "Head of HR Services", "stamp": "MARSA AL NOOR<br>PORTS<br>HR<br>DIVISION"})
DOCS["005231/bank-statement"] = bank_statement({"name": "Salama Juma Al Neyadi", "acct": "•••• 4471 0098", "period": "1 April 2026 – 30 September 2026",
    "rows": [("27 Apr 2026", "SALARY MNPC APR", "38,400.00", "61,215.40"), ("27 May 2026", "SALARY MNPC MAY", "38,400.00", "70,882.15"),
             ("26 Jun 2026", "SALARY MNPC JUN", "38,400.00", "74,109.62"), ("27 Jul 2026", "SALARY MNPC JUL", "38,400.00", "79,450.30"),
             ("27 Aug 2026", "SALARY MNPC AUG", "38,400.00", "83,994.81"), ("28 Sep 2026", "SALARY MNPC SEP", "38,400.00", "90,312.07")]})
DOCS["005231/no-property"] = no_property({"no": "LR-NPC-2026-078120", "date": "3 October 2026", "name": "Salama Juma Al Neyadi", "nameAr": "سلامة جمعة النيادي", "eid": "784-1993-4418820-7"})
DOCS["005231/plot-allocation"] = plot_letter({"ref": "MNDA/HCS/LA/2025/0644", "date": "19 May 2025", "name": "Salama Juma Al Neyadi", "plot": "MN-04-122-0009",
    "district": "MN-04 Al Waha Gardens", "area": "980", "allocated": "19 May 2025"})

for key, html in DOCS.items():
    path = os.path.join(OUT, key + ".html")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
print(json.dumps(sorted(DOCS.keys())))
