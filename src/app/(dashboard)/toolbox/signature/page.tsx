'use client';
import React, { useState } from 'react';
import { Spin } from 'antd';
import { Save, XCircle } from 'lucide-react';

export default function SignaturePage() {
  const [sigForm, setSigForm] = useState({
    slogan: 'Your always-on international enrolment office',
    email: 'partners@bristhnrolmentpartners.com',
    phone: '+44 7921 879 389',
    address: '106 Great Charles Street, Birmingham, B3 3HN',
    logoUrl: '/images/BEP_logo.png',
    socials: [] as { type: string; url: string }[],
  });
  const [sigSaving, setSigSaving] = useState(false);

  const generateSignatureHtml = () => {
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">
  <tr>
    <td style="background-color: #16331E; padding: 20px;">
      <img src="${sigForm.logoUrl}" alt="Bristh Enrollment Partners" style="height: 50px; display: block; max-width: 100%; margin-bottom: 8px;" />
      <span style="color: #E2DFD8; font-size: 13px; font-style: italic;">${sigForm.slogan}</span>
    </td>
  </tr>
  <tr>
    <td style="padding: 15px 0 0 0;">
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">
        ✉️ ${sigForm.email} &nbsp;|&nbsp; 📞 ${sigForm.phone}
      </p>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #666666;">
        🏢 ${sigForm.address}
      </p>
      ${sigForm.socials.length > 0 ? `
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${sigForm.socials.map(s => `<td style="padding-right: 8px;"><a href="${s.url}"><img src="/images/social/${s.type}.png" width="24" height="24" alt="${s.type}" style="display:block;border:none;" /></a></td>`).join('')}
        </tr>
      </table>` : ''}
    </td>
  </tr>
</table>`;
  };

  const handleSaveSignature = async () => {
    setSigSaving(true);
    try {
      const html = generateSignatureHtml();
      let emailHtml = html.replace(`src="${sigForm.logoUrl}"`, `src="cid:bep_signature"`);
      emailHtml = emailHtml.replace(/src="\/images\/social\/([a-zA-Z0-9_-]+)\.png"/g, 'src="cid:icon_$1"');

      const res = await fetch('/api/toolbox/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: emailHtml }),
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
  };

  return (
    <div className="max-w-6xl mx-auto p-8 pb-20 flex flex-col md:flex-row gap-8 h-full">
      <div className="w-full md:w-[40%] space-y-5 flex-shrink-0">
        <div className="mb-4">
          <h1 className="text-2xl font-black text-gray-900">邮件签名编辑器</h1>
          <p className="text-sm text-gray-400 mt-1">定制全局发信 HTML 签名</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 shadow-sm h-full overflow-y-auto max-h-[70vh]">
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Logo 图片</label>
            <input value={sigForm.logoUrl} onChange={e => setSigForm({ ...sigForm, logoUrl: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400 bg-gray-50 text-gray-500" readOnly />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Slogan</label>
            <input value={sigForm.slogan} onChange={e => setSigForm({ ...sigForm, slogan: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">邮箱</label>
            <input value={sigForm.email} onChange={e => setSigForm({ ...sigForm, email: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">联系电话</label>
            <input value={sigForm.phone} onChange={e => setSigForm({ ...sigForm, phone: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">地址</label>
            <input value={sigForm.address} onChange={e => setSigForm({ ...sigForm, address: e.target.value })} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-orange-400" />
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-gray-500">社交媒体链接</label>
              <button onClick={() => setSigForm({ ...sigForm, socials: [...sigForm.socials, { type: 'linkedin', url: '' }] })} className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded hover:bg-orange-100">+ 添加一条</button>
            </div>
            {sigForm.socials.map((s, idx) => (
              <div key={idx} className="flex gap-2 mb-2 items-center">
                <select value={s.type} onChange={e => { const ns = [...sigForm.socials]; ns[idx].type = e.target.value; setSigForm({ ...sigForm, socials: ns }); }} className="border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-orange-400 bg-white">
                  <option value="linkedin">LinkedIn</option>
                  <option value="instagram">Instagram</option>
                  <option value="x">X / Twitter</option>
                  <option value="facebook">Facebook</option>
                  <option value="youtube">YouTube</option>
                  <option value="xiaohongshu">小红书</option>
                </select>
                <input value={s.url} onChange={e => { const ns = [...sigForm.socials]; ns[idx].url = e.target.value; setSigForm({ ...sigForm, socials: ns }); }} placeholder="链接地址..." className="flex-1 border border-gray-200 rounded-lg p-2 text-xs outline-none focus:border-orange-400" />
                <button onClick={() => { const ns = [...sigForm.socials]; ns.splice(idx, 1); setSigForm({ ...sigForm, socials: ns }); }} className="text-gray-300 hover:text-red-500 shrink-0"><XCircle className="w-4 h-4" /></button>
              </div>
            ))}
            {sigForm.socials.length === 0 && <p className="text-[10px] text-gray-400 text-center py-2">暂无社媒链接，点击右上角添加</p>}
          </div>

          <button onClick={handleSaveSignature} disabled={sigSaving} className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
            {sigSaving ? <Spin size="small" /> : <Save className="w-4 h-4" />} 保存为全局系统签名
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-2">保存后，Grace及CRM都会自动读取此签名发信</p>
        </div>
      </div>

      <div className="w-full md:w-[60%] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-gray-800">HTML 效果预览</h2>
        </div>
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-inner p-8 overflow-y-auto max-h-[75vh]">
          <div className="mb-8">
            <p className="text-sm text-gray-800 mb-4">Hello John,</p>
            <p className="text-sm text-gray-800 mb-4">This is a preview of your email body. Your signature will appear below exactly as configured.</p>
            <p className="text-sm text-gray-800">Best regards,</p>
          </div>
          <div dangerouslySetInnerHTML={{ __html: generateSignatureHtml() }} />
        </div>
      </div>
    </div>
  );
}
