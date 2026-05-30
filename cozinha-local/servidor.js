'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

const ADMIN_ID  = '6a15ecb5e2ad56df1ad2a301';
const TOKEN     = 'cozinha-rebeca-2026';
const NOME_IMP  = 'ELGIN i9 COZINHA';
const INTERVALO = 8000;

function montarEscPos(texto, numPedido) {
  const ESC = '\x1B', GS = '\x1D';
  const INIT=ESC+'@', CENTER=ESC+'a\x01', LEFT=ESC+'a\x00';
  const BOLD_ON=ESC+'E\x01', BOLD_OFF=ESC+'E\x00';
  const FONT_GDE=GS+'!\x11', FONT_NOR=GS+'!\x00';
  const FEED='\n', CUT=GS+'V\x41\x03';
  const agora=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const data=new Date().toLocaleDateString('pt-BR');
  let cmd=INIT+CENTER+BOLD_ON+FONT_GDE;
  cmd+='*** PEDIDO #'+numPedido+' ***'+FEED;
  cmd+=FONT_NOR+BOLD_OFF+'========================'+FEED;
  cmd+=LEFT+BOLD_ON+'Hora: '+BOLD_OFF+agora+' - '+data+FEED;
  cmd+='========================'+FEED+FEED;
  cmd+=LEFT+texto+FEED+FEED+FEED+CUT;
  return cmd;
}

function imprimir(texto, numPedido) {
  return new Promise((resolve, reject) => {
    const escpos = montarEscPos(texto, numPedido);
    const tmpFile = path.join(os.tmpdir(), 'pedido_' + Date.now() + '.bin');
    fs.writeFileSync(tmpFile, Buffer.from(escpos, 'binary'));
    const ps = `$bytes = [System.IO.File]::ReadAllBytes('${tmpFile}'); $printer = New-Object System.Drawing.Printing.PrintDocument; $printer.PrinterSettings.PrinterName = '${NOME_IMP}'; Add-Type -AssemblyName System.Drawing; $stream = [System.IO.File]::OpenRead('${tmpFile}'); $raw = New-Object System.Collections.Generic.List[byte]; $buf = New-Object byte[] 4096; while(($n = $stream.Read($buf,0,4096)) -gt 0){ $raw.AddRange($buf[0..($n-1)]) }; $stream.Close(); [System.Runtime.InteropServices.Marshal]::AllocHGlobal(1) | Out-Null`;
    const comando = `powershell -Command "& { $data = [System.IO.File]::ReadAllBytes('${tmpFile}'); $lp = New-Object System.IO.Ports.SerialPort; Add-Type -AssemblyName System.Drawing; $pd = New-Object System.Drawing.Printing.PrintDocument; $pd.PrinterSettings.PrinterName = '${NOME_IMP}'; }"`;
    // Usar rawprint via .NET direto
    const rawCmd = `powershell -Command "& {Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class RawPrint{[DllImport(\"winspool.drv\",CharSet=CharSet.Ansi,ExactSpelling=false)][return:MarshalAs(UnmanagedType.Bool)]public static extern bool OpenPrinter(string pPrinterName,out IntPtr hPrinter,IntPtr pDefault);[DllImport(\"winspool.drv\",ExactSpelling=false)]public static extern bool StartDocPrinter(IntPtr hPrinter,Int32 level,ref DOCINFO di);[DllImport(\"winspool.drv\")]public static extern bool StartPagePrinter(IntPtr hPrinter);[DllImport(\"winspool.drv\")]public static extern bool WritePrinter(IntPtr hPrinter,byte[] pBytes,Int32 dwCount,out Int32 dwWritten);[DllImport(\"winspool.drv\")]public static extern bool EndPagePrinter(IntPtr hPrinter);[DllImport(\"winspool.drv\")]public static extern bool EndDocPrinter(IntPtr hPrinter);[DllImport(\"winspool.drv\")]public static extern bool ClosePrinter(IntPtr hPrinter);[StructLayout(LayoutKind.Sequential)]public struct DOCINFO{[MarshalAs(UnmanagedType.LPStr)]public string pDocName;[MarshalAs(UnmanagedType.LPStr)]public string pOutputFile;[MarshalAs(UnmanagedType.LPStr)]public string pDataType;}};$b=[System.IO.File]::ReadAllBytes('${tmpFile}');$h=IntPtr.Zero;[RawPrint]::OpenPrinter('${NOME_IMP}',[ref]$h,[IntPtr]::Zero);$di=New-Object RawPrint+DOCINFO;$di.pDocName='Pedido';$di.pDataType='RAW';[RawPrint]::StartDocPrinter($h,1,[ref]$di);[RawPrint]::StartPagePrinter($h);$w=0;[RawPrint]::WritePrinter($h,$b,$b.Length,[ref]$w);[RawPrint]::EndPagePrinter($h);[RawPrint]::EndDocPrinter($h);[RawPrint]::ClosePrinter($h)}"`
    exec(rawCmd, { shell: 'cmd.exe', timeout: 15000 }, (err) => {
      try { fs.unlinkSync(tmpFile); } catch(e) {}
      if (err) { console.error('[ERRO] Impressora:', err.message); reject(err); }
      else { console.log('[OK] Pedido #' + numPedido + ' impresso!'); resolve(true); }
    });
  });
}

function apiPost(rota) {
  return new Promise(resolve => {
    const req = https.request(
      { hostname: 'rebecasistemas.com.br', path: rota, method: 'POST', headers: { 'x-cozinha-token': TOKEN } },
      () => resolve()
    );
    req.on('error', () => resolve());
    req.end();
  });
}

function buscarJobs() {
  return new Promise(resolve => {
    const req = https.get(
      'https://rebecasistemas.com.br/api/cozinha/jobs/' + ADMIN_ID + '?token=' + TOKEN,
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d).jobs || []); } catch(e) { resolve([]); } });
      }
    );
    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
  });
}

let processando = false;
async function tick() {
  if (processando) return;
  processando = true;
  try {
    const jobs = await buscarJobs();
    for (const job of jobs) {
      try {
        await imprimir(job.texto, job.mesa || '?');
        await apiPost('/api/cozinha/jobs/' + job._id + '/confirmar');
      } catch(e) { console.error('[ERRO] Job ' + job._id + ':', e.message); }
    }
  } catch(e) { console.error('[ERRO] Loop:', e.message); }
  processando = false;
}

setInterval(tick, INTERVALO);
tick();

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/testar') {
    imprimir('TESTE REBECA COZINHA', 'TESTE')
      .then(() => res.end(JSON.stringify({ sucesso: true })))
      .catch(e => res.end(JSON.stringify({ erro: e.message })));
    return;
  }
  res.end(JSON.stringify({ status: 'rodando', impressora: NOME_IMP }));
}).listen(3333, () => {
  console.log('\n================================');
  console.log('  REBECA COZINHA - Servidor Local v6');
  console.log('  Impressora: ' + NOME_IMP + ' (USB)');
  console.log('  Polling: a cada 8 segundos');
  console.log('================================\n');
});
