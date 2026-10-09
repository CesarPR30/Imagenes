# Imágenes — figuras del método Topocrime

Dos editores en una sola página HTML cada uno para generar las figuras del paper:

| Editor | Figura |
|---|---|
| [`figura-capas.html`](figura-capas.html) | De eventos a subgrafo: siete representaciones espaciales del mismo crimen apiladas en vertical (eventos, KDE, manzanas censales, grilla, intersecciones, segmentos, subgrafo topo-crimen). |
| [`figura-temporal.html`](figura-temporal.html) | Evolución temporal de la topología de un hotspot (t₁ → t₂ → … → tₙ₋₁ → tₙ), con recuadros de zoom. |

Las imágenes exportadas están en [`img/`](img/), en PNG y en SVG vectorial.

![Figura de capas](img/figura_capas.png)

![Figura temporal](img/figura_temporal.png)

## Datos

Lo publicado aquí (`data/sintetico/`) combina:

- **Red vial real de Lima**: calles de OpenStreetMap (la misma red del pipeline), con edificios y parques de OSM. Los barrios se eligen automáticamente entre catorce candidatos por ser los **menos cuadriculados**, según la entropía de orientación de sus calles (Boeing, 2019): Barranco para la figura de capas; Pueblo Libre, El Agustino e Independencia para la temporal. En cada barrio se toma la esquina con más forma de cruce.
- **Delitos simulados**: se reparten a lo largo de los «brazos» que siguen las calles reales desde esa esquina (en cada intersección, la continuación más recta), con intensidades que cambian mes a mes y un mes de apagón.

El hotspot de cada mes se obtiene como en el método: densidad gaussiana sobre la distancia de red (σ = 120 m, truncada en 3σ) y el componente conexo de los nodos que superan una fracción del pico. Ninguna denuncia es real; los barrios no se eligieron por su criminalidad.

Las figuras del paper con datos de Lima se generan con las mismas páginas desde el repositorio del pipeline, con `?data=data/lima` y los archivos que escriben `scripts/build_explainer_data.py` y `scripts/build_temporal_data.py`. Los datos sintéticos se regeneran con `scripts/build_synthetic_figure_data.py --out data/sintetico`.

## Uso

Las páginas leen JSON con `fetch`, así que hay que servirlas por HTTP (abrirlas con doble clic no funciona):

```bash
python -m http.server 8000
# http://127.0.0.1:8000/
```

o activar GitHub Pages en *Settings → Pages → Deploy from a branch → main / (root)*.

Todo se ajusta desde el panel lateral (tamaño, separación, rotación e inclinación de los mapas, colores y gradientes, ubicación, radio de los círculos de aglomeración en esquinas, etiquetas) y se exporta con **Descargar figura** en dos formatos:

- **PNG**, a 2×–6× del tamaño en pantalla;
- **SVG** vectorial: calles, edificios, halos, círculos y texto quedan como trazados editables (Illustrator, Inkscape, LaTeX vía `svg`/`inkscape`). El KDE, que es un campo continuo, va embebido como imagen dentro del SVG.

`svgctx.js` es el puente: implementa la parte de la API de Canvas que usan las páginas y la escribe como SVG, de modo que ambos formatos salen del mismo código de dibujo. La configuración se guarda en el navegador y puede exportarse o cargarse como JSON.
