"""台帳の「潜水表」シート → アプリ用ファイル の往復で、数値が1つも変わらないことを確かめる"""
import subprocess, sys, json, pathlib, tempfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
B = ROOT / 'ledger' / 'build'; B.mkdir(exist_ok=True)
subprocess.run(f'node tests/sample_rows.js > "{B/"sample_rows.json"}"', shell=True, check=True, cwd=ROOT)
with tempfile.TemporaryDirectory() as td:
    x = pathlib.Path(td) / 'ledger.xlsx'; j = pathlib.Path(td) / 'table.json'
    subprocess.run([sys.executable, 'ledger/build_ledger.py', str(x)], check=True, cwd=ROOT, capture_output=True)
    subprocess.run([sys.executable, 'ledger/export_port.py', str(x), str(j)], check=True, cwd=ROOT)
    out = subprocess.run(['node', '-e', f"""
const E=require('./app/src/engine.js');const a=require('./app/tables/naui-2022.json');const b=require({json.dumps(str(j))});
const v=E.validate(b);const d=E.diff(a,b);
console.log(JSON.stringify({{errors:v.errors.length,warnings:v.warnings.length,diff:d.length}}));"""], check=True, cwd=ROOT, capture_output=True, text=True)
r = json.loads(out.stdout)
print('往復テスト', r)
sys.exit(0 if r == {'errors': 0, 'warnings': 0, 'diff': 0} else 1)
