import sys

with open("src/app/(dashboard)/toolbox/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update sigForm state
old_state = """  const [sigForm, setSigForm] = useState({
    email: 'partners@bristhnrolmentpartners.com',
    phone: '+44 7921 879 389',
    address: '106 Great Charles Street, Birmingham, B3 3HN',
    logoUrl: '/images/logo_slogan_white.png',
    socials: [] as { type: string, url: string }[]
  });"""

new_state = """  const [sigForm, setSigForm] = useState({
    slogan: 'Your always-on international enrolment office',
    email: 'partners@bristhnrolmentpartners.com',
    phone: '+44 7921 879 389',
    address: '106 Great Charles Street, Birmingham, B3 3HN',
    logoUrl: '/images/BEP_logo.png',
    socials: [] as { type: string, url: string }[]
  });"""

code = code.replace(old_state, new_state)


# 2. Update generateSignatureHtml
old_html = """  const generateSignatureHtml = () => {
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">
  <tr>
    <td style="background-color: #16331E; padding: 20px;">
      <img src="${sigForm.logoUrl}" alt="Bristh Enrollment Partners" style="height: 60px; display: block; max-width: 100%;" />
    </td>
  </tr>"""

new_html = """  const generateSignatureHtml = () => {
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">
  <tr>
    <td style="background-color: #16331E; padding: 20px;">
      <img src="${sigForm.logoUrl}" alt="Bristh Enrollment Partners" style="height: 50px; display: block; max-width: 100%; margin-bottom: 8px;" />
      <span style="color: #E2DFD8; font-size: 13px; font-style: italic;">${sigForm.slogan}</span>
    </td>
  </tr>"""

code = code.replace(old_html, new_html)

# 3. Add Slogan input field in UI
old_ui_input = """                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Logo 长图</label>
                  <input value={sigForm.logoUrl} onChange={e => setSigForm({...sigForm, logoUrl: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400 bg-gray-50 text-gray-500" readOnly />
                </div>"""

new_ui_input = """                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Logo 图片</label>
                  <input value={sigForm.logoUrl} onChange={e => setSigForm({...sigForm, logoUrl: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400 bg-gray-50 text-gray-500" readOnly />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Slogan</label>
                  <input value={sigForm.slogan} onChange={e => setSigForm({...sigForm, slogan: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>"""

code = code.replace(old_ui_input, new_ui_input)

with open("src/app/(dashboard)/toolbox/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Toolbox UI updated for BEP_logo!")
