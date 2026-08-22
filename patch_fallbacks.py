import sys

files_to_patch = [
    "src/app/api/crm/reply/send/route.ts",
    "src/app/api/bristh/agents/grace/route.ts"
]

fallback = """'<br><br><table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family: Arial, sans-serif; max-width: 600px;">\\n  <tr>\\n    <td style="background-color: #16331E; padding: 20px;">\\n      <img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="height: 50px; display: block; max-width: 100%; margin-bottom: 8px;" />\\n      <span style="color: #E2DFD8; font-size: 13px; font-style: italic;">Your always-on international enrolment office</span>\\n    </td>\\n  </tr>\\n  <tr>\\n    <td style="padding: 15px 0 0 0;">\\n      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">\\n        ✉️ partners@bristhnrolmentpartners.com &nbsp;|&nbsp; 📞 +44 7921 879 389\\n      </p>\\n      <p style="margin: 0 0 12px 0; font-size: 13px; color: #666666;">\\n        🏢 106 Great Charles Street, Birmingham, B3 3HN\\n      </p>\\n    </td>\\n  </tr>\\n</table>'"""

old_str = """'<br><br><img src="cid:bep_signature" alt="Bristh Enrollment Partners" style="max-width: 250px;"/>'"""

for file in files_to_patch:
    with open(file, "r", encoding="utf-8") as f:
        code = f.read()
    code = code.replace(old_str, fallback)
    with open(file, "w", encoding="utf-8") as f:
        f.write(code)

print("Fallbacks patched!")
