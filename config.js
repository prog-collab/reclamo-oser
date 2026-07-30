// Configuracion publica de la pagina del reclamo.
//
// La clave de abajo es la clave "anonima" de Supabase: es publica por diseno y
// esta pensada para viajar en el navegador. Con ella solo se puede ENVIAR el
// formulario y SUBIR archivos. No permite leer ningun dato ni bajar archivos:
// para eso hay que entrar al panel con usuario y contrasena (ver panel.html).
window.RECLAMO_CONFIG = {
  supabaseUrl: 'https://grswqigekcopfrozcxqj.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyc3dxaWdla2NvcGZyb3pjeHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMTkxMDAsImV4cCI6MjA5Nzg5NTEwMH0.8jHhaYi9wC2D5OEixO3M3G8sN40h4ZjIksrfSiNWSVI',
  bucket: 'oser-reclamos',
  // Tope por archivo, en bytes (tiene que coincidir con el limite del bucket).
  maxArchivoBytes: 15 * 1024 * 1024,
};
