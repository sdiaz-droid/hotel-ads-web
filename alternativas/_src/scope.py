# Prefija cada selector con #ax para ganarle al CSS global del sitio.
import re
def _sel(sel):
    out=[]
    for s in sel.split(','):
        s=s.strip()
        if not s: continue
        if s.startswith('.ax.') or s=='.ax' or s.startswith('.ax:') or s.startswith('.ax{'):
            out.append('#ax'+s[3:] if s!='.ax' else '#ax')
        elif s.startswith('.ax ') :
            out.append('#ax '+s[4:])
        elif s.startswith(('from','to')) or re.match(r'^\d',s):
            out.append(s)
        else:
            out.append('#ax '+s)
    return ','.join(out)
def scope(css):
    css=re.sub(r'/\*.*?\*/','',css,flags=re.S)
    res=[];i=0;n=len(css)
    while i<n:
        j=css.find('{',i)
        if j<0: break
        head=css[i:j].strip()
        # buscar cierre equilibrado
        depth=1;k=j+1
        while depth and k<n:
            if css[k]=='{': depth+=1
            elif css[k]=='}': depth-=1
            k+=1
        inner=css[j+1:k-1]
        if head.startswith('@media') or head.startswith('@supports'):
            res.append(head+'{'+scope(inner)+'}')
        elif head.startswith('@keyframes') or head.startswith('@font-face'):
            res.append(head+'{'+inner+'}')
        else:
            res.append(_sel(head)+'{'+inner+'}')
        i=k
    return '\n'.join(res)
