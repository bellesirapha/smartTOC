import * as pdfjsLib from 'pdfjs-dist';
import { readFileSync, existsSync } from 'fs';

const pdfPath = '/workspaces/smartTOC/app/eval/multi column pdf/cybersecurity-principles.pdf';
if (!existsSync(pdfPath)) {
  console.log('PDF not found at', pdfPath);
  // search
  import('child_process').then(({execSync}) => {
    console.log(execSync('find /workspaces/smartTOC -name "cybersecurity*" -type f 2>/dev/null').toString());
  });
} else {
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true}).promise;

  const lines = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 4); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const fontSize = Math.abs(item.transform[0]);
      const fontName = item.fontName || '';
      const bold = /bold|heavy|black/i.test(fontName);
      const text = item.str.trim();
      if (text.length >= 3 && text.length <= 200) {
        lines.push({p, fontSize: fontSize.toFixed(1), bold, fontName: fontName.slice(0,40), text: text.slice(0,80)});
      }
    }
  }

  const sizes = {};
  lines.forEach(l => { 
    const key = l.fontSize + (l.bold ? ' BOLD' : '');
    sizes[key] = (sizes[key] || 0) + 1; 
  });
  console.log('Font size distribution (pages 1-4):');
  Object.entries(sizes).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v} items`));

  console.log('\nBold lines:');
  lines.filter(l => l.bold).forEach(l => console.log(`  p${l.p} ${l.fontSize}pt ${l.text}`));

  console.log('\nNon-bold lines (sample):');
  lines.filter(l => !l.bold).slice(0, 15).forEach(l => console.log(`  p${l.p} ${l.fontSize}pt [${l.fontName}] ${l.text}`));
}
