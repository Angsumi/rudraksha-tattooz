# Rudraksha Tattooz — website

Static site with no build step. Upload this `site/` folder to any static host (Netlify drop, Vercel, GitHub Pages, Cloudflare Pages, or cPanel `public_html`).

Preview locally:

    python3 -m http.server 5173 --directory site

## Where to edit
- Text, contact details, sections: `index.html`
- Colours and fonts: the `:root` variables at the top of `assets/style.css`
- WhatsApp number used by the booking form: `const WA` at the top of `assets/main.js`
- Gallery: add a `<figure class="card">` to `#grid` in `index.html`, then add its image names to the `works` array in `main.js` (same order). Put a `name.webp` (about 1400px) and a `name-sm.webp` (about 640px) in `assets/img/`.

## Hero (stencil to ink)
- `assets/img/hero-stencil.webp` is the bare forearm with a purple transfer stencil, generated from the Shiva & Kali photo. `hero-ink.webp` is the finished tattoo.
- The canvas reveals the ink wherever the needle passes. It auto-shades top to bottom, then visitors can ink it with the mouse or a finger. It loops back to the stencil after about 9 seconds idle.
- The forearm outline used for the auto path and the % counter is the `P` array in `main.js`, in 900x1781 image pixels. Update it if you swap the photo.

## "Stencil to Skin" scrub
- The session plays from 150 stills in `assets/frames/` (432x768 webp, about 3 MB), drawn on a canvas as you scroll. Phones seek video slowly, so swapping stills keeps it smooth.
- All frames start downloading when the page opens, a coarse pass first so it works straight away.
- To rebuild from a new clip:
  `ffmpeg -i clip.mp4 -vf "fps=150/<seconds>,scale=432:768" -c:v libwebp -quality 62 -start_number 0 assets/frames/f%03d.webp`
  then set `FRAMES` and `dur` in `main.js`.

## Facts taken from public listings (please confirm with the client)
- Phone 093623 55247; address Durgabari Rubber Bagan Rd, opposite Darrang College Girls' Hostel, Tin Ali, Tezpur 784001
- Google rating 5.0 from 187 reviews; established 2018 (Justdial); closes 10:30 pm
- Review quotes are short excerpts from his Google reviews
