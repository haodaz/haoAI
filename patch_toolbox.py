import sys

with open("src/app/(dashboard)/toolbox/page.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update activeTool type
code = code.replace(
    "const [activeTool, setActiveTool] = useState<'ppt' | 'legal' | 'webpage' | null>",
    "const [activeTool, setActiveTool] = useState<'ppt' | 'legal' | 'webpage' | 'signature' | null>"
)

# 2. Insert signature state after webIframeRef
sig_state = """  const webIframeRef = useRef<HTMLIFrameElement>(null);

  // Signature State
  const [sigForm, setSigForm] = useState({
    company: 'Bristh Enrollment Partners',
    slogan: 'Your always on international enrolment office',
    email: 'partners@bristhnrolmentpartners.com',
    phone: '+44 7921 879 389',
    address: '106 Great Charles Street, Birmingham, B3 3HN',
    logoUrl: '/images/BEP_logo.png'
  });
  const [sigSaving, setSigSaving] = useState(false);
  
  const generateSignatureHtml = () => {
    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333333; margin-top: 20px; border-top: 1px solid #e0e0e0; padding-top: 15px;">
  <tr>
    <td style="padding-right: 15px; border-right: 2px solid #234E33;">
      <img src="${sigForm.logoUrl}" alt="Logo" style="width: 100px; display: block;" />
    </td>
    <td style="padding-left: 15px;">
      <strong style="color: #234E33; font-size: 16px;">${sigForm.company}</strong><br/>
      <span style="color: #666666;">${sigForm.slogan}</span><br/>
      <span style="font-size: 11px; color: #999999;">✉️ ${sigForm.email} | 📞 ${sigForm.phone}</span><br/>
      <span style="font-size: 11px; color: #999999;">🏢 ${sigForm.address}</span>
    </td>
  </tr>
</table>`;
  };

  const handleSaveSignature = async () => {
    setSigSaving(true);
    try {
      const html = generateSignatureHtml();
      // Replace absolute URL for CID when saving for emails
      const emailHtml = html.replace(`src="${sigForm.logoUrl}"`, `src="cid:bep_signature"`);
      
      const res = await fetch('/api/toolbox/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: emailHtml })
      });
      if (res.ok) {
        alert('全局邮件签名保存成功！');
      } else {
        alert('保存失败');
      }
    } catch (err) {
      alert('Network error');
    }
    setSigSaving(false);
  };"""

code = code.replace("  const webIframeRef = useRef<HTMLIFrameElement>(null);", sig_state)

# 3. Add sidebar button after webpage button
sidebar_btn = """            <p className="text-[10px] text-gray-400 mt-1">Tailwind 响应式落地页设计</p>
          </button>

          <button onClick={() => { setActiveTool('signature'); router.push('/toolbox'); }} className={`w-full text-left p-3 rounded-xl transition-all ${activeTool === 'signature' ? 'bg-orange-50 border border-orange-100' : 'bg-white border border-gray-100 hover:bg-gray-50'}`}>
            <h3 className={`text-xs font-bold flex items-center ${activeTool === 'signature' ? 'text-orange-700' : 'text-gray-700'}`}>
              <Mail className={`w-3.5 h-3.5 mr-2 ${activeTool === 'signature' ? 'text-orange-500' : 'text-gray-400'}`} /> 邮件签名编辑器
            </h3>
            <p className="text-[10px] text-gray-400 mt-1">全局发信 HTML 签名可视化</p>
          </button>"""

code = code.replace("""            <p className="text-[10px] text-gray-400 mt-1">Tailwind 响应式落地页设计</p>
          </button>""", sidebar_btn)

# 4. Remove the disabled mail tool
code = code.replace("""          <div className="border border-gray-100 p-3 rounded-xl opacity-40 hidden md:block">
            <h3 className="text-xs font-bold text-gray-500 flex items-center"><Mail className="w-3.5 h-3.5 mr-2 text-gray-300" /> 邮件发送工具</h3>
            <p className="text-[10px] text-gray-300 mt-1">即将上线</p>
          </div>""", "")

# 5. Add Signature Editor UI block
sig_ui = """        {/* ===== SIGNATURE EDITOR ===== */}
        {activeTool === 'signature' && (
          <div className="max-w-5xl mx-auto p-8 pb-20 flex flex-col md:flex-row gap-8 h-full">
            <div className="w-full md:w-1/2 space-y-5">
              <div className="mb-4">
                <h1 className="text-2xl font-black text-gray-900">邮件签名编辑器</h1>
                <p className="text-sm text-gray-400 mt-1">定制全局发信 HTML 签名</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 shadow-sm">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">公司名称</label>
                  <input value={sigForm.company} onChange={e => setSigForm({...sigForm, company: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Slogan</label>
                  <input value={sigForm.slogan} onChange={e => setSigForm({...sigForm, slogan: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">邮箱</label>
                  <input value={sigForm.email} onChange={e => setSigForm({...sigForm, email: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">联系电话</label>
                  <input value={sigForm.phone} onChange={e => setSigForm({...sigForm, phone: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">地址</label>
                  <input value={sigForm.address} onChange={e => setSigForm({...sigForm, address: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Logo 图片 (URL)</label>
                  <input value={sigForm.logoUrl} onChange={e => setSigForm({...sigForm, logoUrl: e.target.value})} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400 bg-gray-50 text-gray-500" readOnly />
                </div>
                
                <button onClick={handleSaveSignature} disabled={sigSaving} className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                  {sigSaving ? <Spin size="small" /> : <Save className="w-4 h-4" />} 保存为全局系统签名
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-2">保存后，Grace及CRM都会自动读取此签名发信</p>
              </div>
            </div>
            
            <div className="w-full md:w-1/2 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-gray-800">HTML 效果预览</h2>
              </div>
              <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-inner p-8 overflow-y-auto min-h-[300px]">
                {/* 模拟邮件内容 */}
                <div className="mb-8">
                  <p className="text-sm text-gray-800 mb-4">Hello John,</p>
                  <p className="text-sm text-gray-800 mb-4">This is a preview of your email body. Your signature will appear below as configured.</p>
                  <p className="text-sm text-gray-800">Best regards,</p>
                </div>
                <div dangerouslySetInnerHTML={{ __html: generateSignatureHtml() }} />
              </div>
            </div>
          </div>
        )}"""

code = code.replace("{/* ===== PPT TOOL ===== */}", sig_ui + "\n\n        {/* ===== PPT TOOL ===== */}")

with open("src/app/(dashboard)/toolbox/page.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Toolbox patched.")
