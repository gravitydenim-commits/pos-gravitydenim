import '../src/index.css';

export const metadata = {
  title: 'Gravity Denim POS',
  description: 'Sistema POS para Gravity Denim',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <div id="root">
          {children}
        </div>
      </body>
    </html>
  )
}
