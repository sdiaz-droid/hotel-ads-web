# Arma alternativa-N/index.html con el menú, el formulario y el pie REALES de la página
# más el contenido nuevo de alternativas/_src/altN.html.
#   python alternativas/_src/build.py        -> arma las dos
#   python alternativas/_src/build.py 1      -> sólo la 1
import re, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from scope import scope

R = pathlib.Path(__file__).resolve().parents[2]
src = (R/'index.html').read_text(encoding='utf8')
lines = src.split('\n')
prefix = '\n'.join(lines[:5225]) + '\n</div></div>'
suffix = src[src.index('<section class="trial" id="prueba-gratis">'):]
# «También podría interesarte» (notas del blog) de la página oficial: va después del formulario
_t = src.index('<section class="trial" id="prueba-gratis">')
blog = src[src.rindex('<section class="sec sec--tight">', 0, _t):_t]
assert 'interesarte' in blog
# El hero nuevo es claro: el sitio va en su versión clara.
prefix = prefix.replace('pxsite pxsite--dark', 'pxsite pxsite--light', 1)

icons = json.loads((R/'alternativas/_src/icons.json').read_text(encoding='utf8'))
def ic(m):
    name, cls = m.group(1), (m.group(2) or '')
    return ('<svg class="lc %s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>') % (cls, icons[name])

SCRIPT = r'<script src="/alternativas/[^"]+"></script>\s*'

for n in sys.argv[1:] or ['1', '2']:
    body = (R/f'alternativas/_src/alt{n}.html').read_text(encoding='utf8')
    body = re.sub(r'<i data-ic="([a-z0-9-]+)"(?: class="([^"]*)")?></i>', ic, body)
    head_extra, body = body.split('<!--BODY-->', 1)

    # CSS: base + el propio de la alternativa, todo con prefijo #ax
    base = (R/'alternativas/base.css').read_text(encoding='utf8')
    head_extra = head_extra.replace('<link rel="stylesheet" href="/alternativas/base.css">',
                                    '<style>' + scope(base) + '</style>')
    head_extra = re.sub(r'<style>(.*?)</style>',
                        lambda m: m.group(0) if m.group(1).lstrip().startswith('#ax') else '<style>' + scope(m.group(1)) + '</style>',
                        head_extra, flags=re.S)

    # Formulario real: se viste claro y lleva el copy de la alternativa
    # Los scripts propios van al final, después del formulario
    scripts = ''.join(re.findall(SCRIPT, body))
    body = re.sub(SCRIPT, '', body)

    suf = suffix
    m = re.search(r'<!--TRIAL-->(.*?)<!--/TRIAL-->', body, flags=re.S)
    if m:
        body = body.replace(m.group(0), '')
        suf = suf.replace('<section class="trial" id="prueba-gratis">',
                          '<section class="trial trial--light ax-trial" id="prueba-gratis">', 1)
        suf = re.sub(r'<div class="trial-copy[^"]*"[^>]*>.*?</ul></div>', lambda _: m.group(1).strip(),
                     suf, count=1, flags=re.S)
        head_extra += '<style>.pxsite{background:#F6F7FB}' + scope((R/'alternativas/trial.css').read_text(encoding='utf8')) + '</style>'
        # el formulario queda DENTRO de #ax para heredar el sistema (avisos, tipografía)
        body = body.rstrip()
        assert body.endswith('</div>'), 'el cuerpo tiene que cerrar con el </div> de .ax'
        body = body[:-6]
        k = suf.index('</section>') + len('</section>')
        suf = suf[:k] + '\n</div><!-- /#ax -->\n' + blog + suf[k:]

    suf =suf.replace('</body>', scripts + '</body>', 1)

    out = prefix.replace('</head>', head_extra + '\n</head>', 1) + '\n' + body + '\n' + suf
    (R/f'alternativa-{n}').mkdir(exist_ok=True)
    (R/f'alternativa-{n}/index.html').write_text(out, encoding='utf8')
    print('ok', n, len(out))
