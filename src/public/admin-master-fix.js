// Adicionar esta função no admin-master.html antes do </script>
async function editarPlano(id) {
    try {
        const res = await fetch(API + '/planos');
        const planos = await res.json();
        const plano = planos.find(p => p._id === id);
        if (!plano) { alert('Plano não encontrado'); return; }
        document.getElementById('planoId').value = plano._id;
        document.getElementById('planoNome').value = plano.nome || '';
        document.getElementById('planoDescricao').value = plano.descricao || '';
        document.getElementById('planoPreco').value = plano.preco || '';
        document.getElementById('planoMotoristas').value = plano.limiteMotoristas || '';
        document.getElementById('planoCorridas').value = plano.limiteCorridas || '';
        document.getElementById('planoRecursos').value = (plano.recursos || []).join(', ');
        document.getElementById('modalPlanoTitulo').textContent = 'Editar Plano';
        document.getElementById('modalPlano').classList.add('active');
    } catch (e) { console.error(e); alert('Erro ao carregar plano'); }
}
