# Padrão `ROADMAP_RICKOS.md`

O rickOS lê o arquivo `ROADMAP_RICKOS.md` na **raiz do repositório** de cada projeto (o
"caminho local" cadastrado no projeto) e mostra o roadmap na aba **🗺 Roadmap** da
página do projeto, em **árvore** ou **tabela**. Clicar no marcador de um item grava a
mudança de volta no arquivo.

Sem o arquivo, a aba oferece **"Criar a partir do modelo"**.

## Estrutura

```markdown
# Roadmap — Nome do projeto          ← título (ignorado)

## Área / épico                       ← nível 1 da árvore (coluna "Área" na tabela)

### Funcionalidade                    ← nível 2 (coluna "Funcionalidade")
- [ ] Tarefa @v1.2 !alta              ← item com status, versão e prioridade
  - [x] Subtarefa                     ← itens aninhados por indentação (2 espaços)
- Nota sem checkbox                   ← aparece na árvore, não conta no progresso
```

## Marcadores de status

| Marcador | Significado   |
|----------|---------------|
| `[ ]`    | A fazer       |
| `[~]`    | Em andamento  |
| `[x]`    | Feito         |
| `[-]`    | Descartado (não conta no progresso) |

Clicar no marcador na árvore avança `[ ] → [~] → [x] → [ ]`; na tabela há um seletor.

## Metadados opcionais (no fim do item)

* `@v1.2` — versão/ciclo da entrega (filtro "versão" no topo).
* `!alta`, `!media`, `!baixa` — prioridade.

## Exemplo

```markdown
# Roadmap — RickOS

## Projetos

### Central de projetos
- [x] Situação × estágio @v2 !alta
- [~] Página do projeto @v2 !alta
  - [x] Próxima ação e onde parei
  - [ ] Roadmap em árvore
- [ ] Revisão semanal com IA @v2.1

## Finanças
- [ ] Importar OFX @v3
- [-] Integração com banco X
```
