// ========== GPS PERSISTENTE ==========
const GPSPersistente = {
    watchId: null,
    latitude: null,
    longitude: null,
    precisao: null,
    callbacks: [],
    
    async iniciar() {
        if (!navigator.geolocation) {
            console.error('GPS não suportado');
            return false;
        }
        
        if (navigator.permissions) {
            try {
                const permissao = await navigator.permissions.query({ name: 'geolocation' });
                if (permissao.state === 'denied') {
                    alert('⚠️ GPS bloqueado! Libere nas configurações do celular.');
                    return false;
                }
            } catch (e) {}
        }
        
        return this.ativarMonitoramento();
    },
    
    ativarMonitoramento() {
        return new Promise((resolve, reject) => {
            const opcoes = { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 };
            
            navigator.geolocation.getCurrentPosition(
                (pos) => { this.atualizarPosicao(pos); resolve(true); },
                (erro) => { this.tratarErro(erro); reject(erro); },
                opcoes
            );
            
            if (this.watchId) navigator.geolocation.clearWatch(this.watchId);
            
            this.watchId = navigator.geolocation.watchPosition(
                (pos) => this.atualizarPosicao(pos),
                (erro) => this.tratarErro(erro),
                opcoes
            );
        });
    },
    
    atualizarPosicao(posicao) {
        this.latitude = posicao.coords.latitude;
        this.longitude = posicao.coords.longitude;
        this.precisao = posicao.coords.accuracy;
        
        localStorage.setItem('gps_lat', this.latitude);
        localStorage.setItem('gps_lng', this.longitude);
        
        this.callbacks.forEach(cb => cb(this.latitude, this.longitude, this.precisao));
    },
    
    tratarErro(erro) {
        if (erro.code === erro.PERMISSION_DENIED) {
            alert('⚠️ Permissão GPS negada! Ative nas configurações.');
        }
    },
    
    onAtualizar(callback) { this.callbacks.push(callback); },
    getPosicao() { return { latitude: this.latitude, longitude: this.longitude, precisao: this.precisao }; },
    parar() { if (this.watchId) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; } }
};

window.GPSPersistente = GPSPersistente;
