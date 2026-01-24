// Verificação de autenticação
(function() {
    const token = localStorage.getItem('token');
    const publicPages = ['/admin/login', '/admin/login.html'];
    const currentPath = window.location.pathname;
    
    const isPublicPage = publicPages.some(page => currentPath.includes(page));
    
    if (!token && !isPublicPage) {
        window.location.href = '/admin/login';
    }
    
    if (token && isPublicPage) {
        window.location.href = '/admin';
    }
})();
