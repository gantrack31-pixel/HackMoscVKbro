# Faithful template covers

The first-slide preview cache is keyed by actual PPTX bytes, parser normalization
version and rendering version (`first-slide-4-faithful`). An unchanged filename
with changed contents gets a new key. Existing owner checks run before cache
responses, including conditional responses; the cache is not a public asset URL.

When LibreOffice/soffice and pdftoppm are available, conversion uses a temporary
profile and a conversion-only PPTX copy with external relationships removed. Only
the first page is rasterized. The user's original PPTX is never rewritten.

When conversion is unavailable or fails, the fallback may use a sufficiently
large embedded `docProps/thumbnail` whose aspect ratio matches the deck. Otherwise
a raw picture is accepted only when it is the **single** slide object, opaque,
rectangular, unrotated, unflipped and exactly covers the canvas. Crop, border,
effects, transparency, additional text/shapes and partial coverage require a
renderer. The output reflects the slide's actual stretch/aspect ratio, without
upscaling source pixels. Arbitrary unreferenced `ppt/media` files are never covers.
An unavailable preview remains unavailable; a background is not represented as a
complete slide with its missing title.

Local environment check on 19 October 2026: pdftoppm is available in the bundled
Poppler runtime. LibreOffice/soffice is absent from PATH and the standard Windows
installation directory. Therefore no claim is made that the composite VK first
slides were newly rendered by Office in this run. A genuine embedded thumbnail
or separately verified content-keyed prerender is still necessary without a
renderer. No invented covers or generic image-generation assets were substituted.

Tests cover content invalidation, negative caching, raster bounds, high-resolution
embedded covers, overlays, crop, rotation, partial coverage, alpha, borders,
nonrectangular clipping, nonuniform stretch, wrong-ratio thumbnails, renderer
failure, first-page conversion with external links stripped, lossless card cache
and access checks. These fixtures prove fallback behavior; they do not constitute
a visual font/master comparison in Microsoft PowerPoint.
