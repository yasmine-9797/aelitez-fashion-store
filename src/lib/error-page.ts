export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fff; color: #141414; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; border-top: 3px solid #e11d24; box-sizing: border-box; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      .logo { display: block; width: 80px; height: 80px; margin: 0 auto 1.5rem; border-radius: 50%; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #5c5c5c; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.75rem 1.5rem; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; border: 2px solid transparent; }
      .primary { background: #e11d24; color: #fff; }
      .primary:hover { background: #b3121a; }
      .secondary { background: #fff; color: #141414; border-color: #141414; }
    </style>
  </head>
  <body>
    <div class="card">
      <img class="logo" src="/apple-touch-icon.png" alt="AELITEZ CLOTHINGS" width="80" height="80" />
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
