# nextgensw.org

Static website for **NextGen SW** — a paid youth internship and mentorship program rooted in Southwest DC.

## Stack
- Plain HTML/CSS/JS, no build step
- Hosted on Netlify, custom domain `nextgensw.org`
- Inter via Google Fonts; brand palette in `assets/css/styles.css`

## Local preview
Open `index.html` directly, or run any static server:

```sh
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Deploy
Pushes to `main` deploy to Netlify automatically. Configuration is in `netlify.toml`.

## Structure
```
index.html              single-page site (12 sections per guidance doc)
assets/css/styles.css   design tokens + section styles
assets/js/main.js       mobile nav, footer year
assets/img/logo.png     brand mark
downloads/              public PDFs (slides, flyer)
netlify.toml            headers + caching
_redirects              short-link redirects to anchors
```

## Brand palette
| Role            | Hex       |
| --------------- | --------- |
| Brick Red       | `#D93621` |
| Leaf Green      | `#38A460` |
| Potomac Blue    | `#50AAE1` |
| Smiley Yellow   | `#FED01D` |
| Marble Gray     | `#E7E3E2` |
| Cherry Blossom  | `#F8DDE9` |

## TODO
- [ ] Replace donate/partner/apply placeholder URLs with live links
- [ ] Embed launch-meeting YouTube video in `#learn-more`
- [ ] Add team headshots in `assets/img/team/`
- [ ] Add community photos in `assets/img/photos/`
- [ ] Drop launch slides PDF and flyer into `downloads/`
- [ ] Confirm DNS for `nextgensw.org` points to Netlify
