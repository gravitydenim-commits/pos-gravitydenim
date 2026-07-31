import '../src/index.css';

export const metadata = {
  title: 'Gravity Denim POS',
  description: 'Sistema POS para Gravity Denim',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onerror = function(message, source, lineno, colno, error) {
                var errStr = '❌ ERROR FATAL: ' + message + '\\n\\nArchivo: ' + source + '\\nLínea: ' + lineno + '\\nStack: ' + (error ? error.stack : '');
                alert(errStr);
                var div = document.createElement('div');
                div.style.position = 'fixed';
                div.style.top = '0';
                div.style.left = '0';
                div.style.width = '100vw';
                div.style.height = '100vh';
                div.style.backgroundColor = 'rgba(0,0,0,0.9)';
                div.style.color = 'red';
                div.style.zIndex = '999999';
                div.style.padding = '20px';
                div.style.whiteSpace = 'pre-wrap';
                div.style.overflow = 'auto';
                div.textContent = errStr;
                document.body.appendChild(div);
              };
              window.addEventListener("unhandledrejection", function(event) {
                var errStr = '❌ UNHANDLED PROMISE: ' + (event.reason ? event.reason.message || event.reason : 'Rejection without reason') + '\\n\\nStack: ' + (event.reason && event.reason.stack ? event.reason.stack : '');
                alert(errStr);
                var div = document.createElement('div');
                div.style.position = 'fixed';
                div.style.top = '0';
                div.style.left = '0';
                div.style.width = '100vw';
                div.style.height = '100vh';
                div.style.backgroundColor = 'rgba(0,0,0,0.9)';
                div.style.color = 'orange';
                div.style.zIndex = '999999';
                div.style.padding = '20px';
                div.style.whiteSpace = 'pre-wrap';
                div.style.overflow = 'auto';
                div.textContent = errStr;
                document.body.appendChild(div);
              });
            `
          }}
        />
      </head>
      <body>
        <div id="root">
          {children}
        </div>
      </body>
    </html>
  )
}
