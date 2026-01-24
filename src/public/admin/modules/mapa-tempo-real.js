// Módulo Mapa em Tempo Real
const MapaTempoReal = {
    mapa: null,
    marcadores: new Map(),
    
    inicializar: function(elementId) {
        console.log('Mapa inicializado no elemento:', elementId);
        this.atualizarMarcadores();
        setInterval(() => this.atualizarMarcadores(), 10000);
    },
    
    atualizarMarcadores: async function() {
        try {
            const response = await fetch('/api/gps-integrado');
            const motoristas = await response.json();
            
            motoristas.forEach(m => {
                if (m.latitude && m.longitude) {
                    this.marcadores.set(m.id, {
                        id: m.id,
                        nome: m.nome,
                        latitude: m.latitude,
                        longitude: m.longitude,
                        status: m.status
                    });
                }
            });
            
            console.log('Marcadores atualizados:', this.marcadores.size);
        } catch (error) {
            console.error('Erro ao atualizar mapa:', error);
        }
    },
    
    obterMarcadores: function() {
        return Array.from(this.marcadores.values());
    },
    
    centralizarEm: function(latitude, longitude) {
        console.log('Centralizar em:', latitude, longitude);
    }
};

if (typeof module !== 'undefined') module.exports = MapaTempoReal;
