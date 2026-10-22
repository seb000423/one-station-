import base64
import os
src='src'; r=lambda f: open(os.path.join(src,f),encoding='utf-8').read()
os.makedirs('dist/artifact',exist_ok=True); os.makedirs('dist/local',exist_ok=True); os.makedirs('site',exist_ok=True)
def page(head, body, scripts=''):
    art = head + body + scripts
    loc = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n' + head + '</head>\n<body>\n' + body + scripts + '\n</body>\n</html>\n'
    return art, loc
for name, parts in {'console.html':('console.head.html','console.body.html',['kin.js','app.js']), 'index.html':('index.head.html','index.body.html',['hero_flag.js','kin.js','app.js','index.js'])}.items():
    if not os.path.exists(os.path.join(src,parts[0])): continue
    bk=open('assets/baked.json').read() if os.path.exists('assets/baked.json') else '{}'
    sc=''.join('<script>\n'+r(f).replace('const BAKED = {};','const BAKED = '+bk+';')+'\n</script>\n' for f in parts[2])
    LOGO='data:image/png;base64,'+base64.b64encode(open('assets/logo_white.png','rb').read()).decode()
    a,l=page(r(parts[0]), r(parts[1]).replace('{{LOGO}}',LOGO), sc)
    open('dist/artifact/'+name,'w',encoding='utf-8').write(a)
    open('dist/local/'+name,'w',encoding='utf-8').write(l)
    print(name, len(a))
