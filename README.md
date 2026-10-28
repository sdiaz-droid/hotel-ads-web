# Hotel Ads — página web

Copia estática de la página de producto Hotel Ads de Pxsol (https://www.pxsol.com/es-ar/producto/hotel-ads) para editarla en equipo y verla en Vercel.

- `index.html`: la página entera (texto, imágenes y estilos propios de la página), sin el menú ni el pie del sitio.
- `producto/assets/` y `api/marketing-asset/`: fotos, logos e íconos.
- `_next/static/`: hoja de estilos del sitio de Pxsol. No hace falta tocarla.

**Cómo se trabaja:** editás `index.html` en una rama, abrís un pull request y Vercel genera una
preview para verlo. Al mergear a `main` se publica en https://hotel-ads-web.vercel.app

Lo que se apruebe acá después se porta al sitio real (Nexus).

Preview automática: cada push a una rama o a `main` dispara un deploy en Vercel.
