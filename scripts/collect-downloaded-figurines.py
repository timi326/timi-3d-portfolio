from pathlib import Path
import argparse,json,struct,time
parser=argparse.ArgumentParser(description='Collect permitted figurine GLBs from a browser cache directory.')
parser.add_argument('cache',type=Path,help='Path to the browser Cache_Data directory')
args=parser.parse_args()
cache=args.cache.expanduser().resolve()
out=Path('artifacts/figurines/sources')
allowed={'8270f6dcb8c34f77b586d6c7c39afc27':'furina','c4071fa4e5f1462fa478417d1aea1130':'march7','efc3c69c22334f95be39c096cf5f476f':'miku','44b58336c7344f058a02c6944b7ad843':'luffy'}
for p in cache.glob('f_*'):
 if p.stat().st_mtime<time.time()-3600:continue
 try:f=p.open('rb')
 except (PermissionError,FileNotFoundError):continue
 with f:
  h=f.read(20)
  if h[:4]!=b'glTF' or len(h)<20 or struct.unpack_from('<I',h,8)[0]!=p.stat().st_size:continue
  try:d=json.loads(f.read(struct.unpack_from('<I',h,12)[0]));extra=d['asset'].get('extras',{})
  except Exception:continue
 for uid,name in allowed.items():
  if uid in extra.get('source',''):
   (out/(name+'.glb')).write_bytes(p.read_bytes());(out/(name+'-credits.json')).write_text(json.dumps(extra,ensure_ascii=False,indent=2),encoding='utf-8');print(name,p.stat().st_size)
