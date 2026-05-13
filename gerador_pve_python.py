import os
import json
import math
import time
import requests
import numpy as np # O Motor Turbo!
import pandas as pd # Para organizar tabelas rapidamente

# 📁 CRIANDO A PASTA NOVA
pasta_destino = os.path.join(os.path.dirname(__file__), 'json', 'simulacao_pve_python')
os.makedirs(pasta_destino, exist_ok=True)

# 1. URLs da Base de Dados
URLS = {
    "MAIN_DATA": "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/poke_data.json",
    "MEGA_DATA": "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/mega_reides.json",
    "GIGAMAX_DATA": "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/poke_data_gigamax.json",
    "TYPE_EFFECTIVENESS": "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/eficacia_tipos_poke.json",
    "MOVES_GYM_FAST": "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/movimentos_rapidos_gym.json",
    "MOVES_GYM_CHARGED": "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/movimentos_carregados_gym.json",
    "MOVE_DATA": "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/moves.json"
}

# 2. Tabela de CPM
cpms = [
    0.09399, 0.13513, 0.16639, 0.19265, 0.21573, 0.23657, 0.25572, 0.27353, 0.29024, 0.30605, 
    0.32108, 0.33544, 0.34921, 0.36245, 0.37523, 0.38759, 0.39956, 0.41119, 0.42250, 0.43292, 
    0.44310, 0.45305, 0.46279, 0.47233, 0.48168, 0.49085, 0.49985, 0.50870, 0.51739, 0.52594, 
    0.53435, 0.54263, 0.55079, 0.55883, 0.56675, 0.57456, 0.58227, 0.58988, 0.59740, 0.60482, 
    0.61215, 0.61940, 0.62656, 0.63364, 0.64065, 0.64758, 0.65443, 0.66121, 0.66793, 0.67458, 
    0.68116, 0.68768, 0.69414, 0.70054, 0.70688, 0.71316, 0.71939, 0.72557, 0.73170, 0.73474, 
    0.73776, 0.74078, 0.74378, 0.74678, 0.74976, 0.75272, 0.75568, 0.75863, 0.76156, 0.76448, 
    0.76739, 0.77029, 0.77318, 0.77606, 0.77893, 0.78179, 0.78463, 0.78747, 0.79030, 0.79280, 
    0.79530, 0.79780, 0.80030, 0.80280, 0.80529, 0.80780, 0.81029, 0.81280, 0.81529, 0.81780, 
    0.82029, 0.82280, 0.82529, 0.82780, 0.83029, 0.83280, 0.83530, 0.83780, 0.84030
]

GLOBAL_POKE_DB = {}

# 3. Tradutor de Eficácia
def get_type_effectiveness(move_type, defender_types, type_data):
    if not move_type or not defender_types or not type_data:
        return 1.0
    
    def formatar_tipo(t):
        if not t: return ""
        t_norm = str(t).upper().replace("POKEMON_TYPE_", "").strip()
        dicionario = {
            "NORMAL": "Normal", "FIRE": "Fogo", "WATER": "Água", "ELECTRIC": "Elétrico", "GRASS": "Planta", 
            "ICE": "Gelo", "FIGHTING": "Lutador", "POISON": "Venenoso", "GROUND": "Terrestre", 
            "FLYING": "Voador", "PSYCHIC": "Psíquico", "BUG": "Inseto", "ROCK": "Pedra", 
            "GHOST": "Fantasma", "DRAGON": "Dragão", "STEEL": "Aço", "DARK": "Sombrio", "FAIRY": "Fada"
        }
        return dicionario.get(t_norm, t_norm.capitalize())

    ataque_pt = formatar_tipo(move_type)
    defensor_pt = sorted([formatar_tipo(t) for t in defender_types if t and str(t).lower() != "none"])

    dados_match = None
    for entry in type_data:
        json_tipos = entry.get("tipos") or entry.get("tipo")
        if not isinstance(json_tipos, list):
            json_tipos = [json_tipos]
        json_tipos = sorted([formatar_tipo(t) for t in json_tipos])
        
        if json_tipos == defensor_pt:
            dados_match = entry
            break

    if not dados_match or "defesa" not in dados_match:
        return 1.0

    defesa = dados_match["defesa"]
    
    def check_cat(categoria):
        if not categoria: return None
        for mult_key, tipos in categoria.items():
            if ataque_pt in tipos:
                return float(mult_key.replace("x", ""))
        return None

    f_fraq = check_cat(defesa.get("fraqueza"))
    if f_fraq is not None: return f_fraq
    
    f_res = check_cat(defesa.get("resistencia"))
    if f_res is not None: return f_res
    
    if "imunidade" in defesa and ataque_pt in defesa["imunidade"]:
        return 0.390625

    return 1.0

# =====================================================================
# ⚡ 4. O MOTOR VETORIZADO (NUMPY ACELERAÇÃO MÁXIMA)
# =====================================================================
def calcular_melhores_combos_numpy(pokemon, oponente, tempo_maximo_raid=300):
    if not pokemon.get("baseStats") or not oponente.get("fastMoves") or not oponente.get("chargedMoves"):
        return []

    CPM = 0.7903
    atk_user = (pokemon["baseStats"].get("atk", 10) + 15) * CPM
    def_user = (pokemon["baseStats"].get("def", 10) + 15) * CPM
    attacker_hp_max = math.floor((pokemon["baseStats"].get("hp", 10) + 15) * CPM)

    is_shadow = "shadow" in pokemon["speciesName"].lower()
    atk_final_user = atk_user * 1.2 if is_shadow else atk_user
    damage_bonus_mult = 1.1 if pokemon["speciesName"].lower().startswith("mega ") else 1.0

    atk_boss_real = (oponente["baseStats"]["atk"] + 15) * CPM
    def_inimigo_real = max(1, (oponente["baseStats"]["def"] + 15) * CPM)
    def_user_final = def_user * 0.833 if is_shadow else def_user
    
    razao_dano_atacante = atk_final_user / def_inimigo_real
    razao_dano_boss = atk_boss_real / def_user_final

    def get_move_data(move_id, is_fast):
        map_db = GLOBAL_POKE_DB["gymFastMap"] if is_fast else GLOBAL_POKE_DB["gymChargedMap"]
        move = map_db.get(move_id)
        if not move and not move_id.endswith("_FAST"): move = map_db.get(move_id + "_FAST")
        if not move and move_id.endswith("_FAST"): move = map_db.get(move_id.replace("_FAST", ""))
        
        if not move or (not move.get("durationMs") and not move.get("duration")):
            fallback = GLOBAL_POKE_DB["moveDataObjMap"].get(move_id) or GLOBAL_POKE_DB["moveDataObjMap"].get(move_id + "_FAST")
            if fallback: move = fallback
        return move

    combos = []
    
    for fast_id in pokemon.get("fastMoves", []):
        fast_move = get_move_data(fast_id, True)
        if not fast_move: continue

        for charged_id in pokemon.get("chargedMoves", []):
            charged_move = get_move_data(charged_id, False)
            if not charged_move: continue

            soma_dps_geral, soma_tdo_geral, soma_estimador, soma_dano_total_geral = 0, 0, 0, 0
            simulacoes_validas = 0
            dps_min, dps_max = 9999.0, 0.0
            mortes_min, mortes_max = 9999.0, 0.0

            for boss_fast_id in oponente["fastMoves"]:
                b_fast = get_move_data(boss_fast_id, True)
                if not b_fast: continue

                for boss_charged_id in oponente["chargedMoves"]:
                    b_charged = get_move_data(boss_charged_id, False)
                    if not b_charged: continue

                    m_fast = 1.2 if any(str(t).lower() == str(fast_move.get("type")).lower() for t in pokemon.get("types", [])) else 1.0
                    m_fast *= get_type_effectiveness(fast_move.get("type"), oponente["tipos"], GLOBAL_POKE_DB["dadosEficacia"])
                    
                    m_charged = 1.2 if any(str(t).lower() == str(charged_move.get("type")).lower() for t in pokemon.get("types", [])) else 1.0
                    m_charged *= get_type_effectiveness(charged_move.get("type"), oponente["tipos"], GLOBAL_POKE_DB["dadosEficacia"])

                    m_boss_fast = 1.2 if any(str(t).lower() == str(b_fast.get("type")).lower() for t in oponente["tipos"]) else 1.0
                    m_boss_fast *= get_type_effectiveness(b_fast.get("type"), pokemon.get("types", []), GLOBAL_POKE_DB["dadosEficacia"])

                    m_boss_charged = 1.2 if any(str(t).lower() == str(b_charged.get("type")).lower() for t in oponente["tipos"]) else 1.0
                    m_boss_charged *= get_type_effectiveness(b_charged.get("type"), pokemon.get("types", []), GLOBAL_POKE_DB["dadosEficacia"])

                    dmg_fast = math.floor(0.5 * fast_move.get("power", 0) * razao_dano_atacante * m_fast * damage_bonus_mult) + 1
                    dmg_charged = math.floor(0.5 * charged_move.get("power", 0) * razao_dano_atacante * m_charged * damage_bonus_mult) + 1
                    dmg_boss_fast = math.floor(0.5 * b_fast.get("power", 0) * razao_dano_boss * m_boss_fast) + 1
                    dmg_boss_charged = math.floor(0.5 * b_charged.get("power", 0) * razao_dano_boss * m_boss_charged) + 1

                    t_fast = float(fast_move.get("duration", fast_move.get("cooldown", 500) / 1000))
                    if t_fast > 10: t_fast /= 1000
                    if t_fast < 0.1: t_fast = 0.5
                    t_fast += 0.05
                    
                    t_charged = float(charged_move.get("duration", charged_move.get("cooldown", 2000) / 1000))
                    if t_charged > 10: t_charged /= 1000
                    if t_charged < 0.1: t_charged = 2.0
                    t_charged += 0.5

                    t_boss_fast_base = float(b_fast.get("duration", b_fast.get("cooldown", 1000) / 1000))
                    t_boss_charged_base = float(b_charged.get("duration", b_charged.get("cooldown", 2000) / 1000))

                    en_gain = max(1, fast_move.get("energyGain", fast_move.get("energy", 6)))
                    en_cost = abs(charged_move.get("energyCost", charged_move.get("energy", 50)))
                    boss_en_cost = abs(b_charged.get("energyCost", b_charged.get("energy", 50)))
                    boss_en_gain = b_fast.get("energyGain", b_fast.get("energy", 10))

                    # 🎯 MATRIZES VETORIZADAS NUMPY (O Segredo da Velocidade)
                    NUM_LUTAS_RNG = 3

                    hp_boss = np.full(NUM_LUTAS_RNG, float(oponente["baseStats"]["hp"]))
                    hp_atual = np.full(NUM_LUTAS_RNG, float(attacker_hp_max))
                    energia_atacante = np.zeros(NUM_LUTAS_RNG)
                    energia_boss = np.zeros(NUM_LUTAS_RNG)
                    relogio = np.zeros(NUM_LUTAS_RNG)
                    prox_acao_atacante = np.zeros(NUM_LUTAS_RNG)
                    prox_acao_boss = 1.5 + np.random.rand(NUM_LUTAS_RNG)
                    mortes_totais = np.zeros(NUM_LUTAS_RNG)

                    limitador = 0
                    while limitador < 15000:
                        limitador += 1
                        active = (hp_boss > 0) & (relogio < tempo_maximo_raid)
                        
                        if not np.any(active):
                            break
                        
                        proximo_evento = np.minimum(prox_acao_atacante, prox_acao_boss)
                        relogio = np.where(active & (proximo_evento > relogio), proximo_evento, relogio)
                        
                        atacante_acts = active & (relogio >= prox_acao_atacante)
                        boss_acts = active & (~atacante_acts) & (relogio >= prox_acao_boss)
                        
                        # --- TURNO DO ATACANTE ---
                        if np.any(atacante_acts):
                            usa_carregado_atk = atacante_acts & (energia_atacante >= en_cost)
                            usa_fast_atk = atacante_acts & (~usa_carregado_atk)
                            
                            hp_boss[usa_carregado_atk] -= dmg_charged
                            energia_atacante[usa_carregado_atk] -= en_cost
                            prox_acao_atacante[usa_carregado_atk] = relogio[usa_carregado_atk] + t_charged
                            energia_boss[usa_carregado_atk] += np.ceil(dmg_charged * 0.1)
                            
                            hp_boss[usa_fast_atk] -= dmg_fast
                            energia_atacante[usa_fast_atk] += en_gain
                            prox_acao_atacante[usa_fast_atk] = relogio[usa_fast_atk] + t_fast
                            energia_boss[usa_fast_atk] += np.ceil(dmg_fast * 0.1)
                            
                        # --- TURNO DO BOSS ---
                        if np.any(boss_acts):
                            pode_carregado_boss = boss_acts & (energia_boss >= boss_en_cost)
                            coin_flip = np.random.rand(NUM_LUTAS_RNG) < 0.5
                            usa_carregado_boss = pode_carregado_boss & coin_flip
                            usa_fast_boss = boss_acts & (~usa_carregado_boss)
                            
                            delay_rng = 1.5 + np.random.rand(NUM_LUTAS_RNG)
                            
                            hp_atual[usa_carregado_boss] -= dmg_boss_charged
                            energia_boss[usa_carregado_boss] -= boss_en_cost
                            prox_acao_boss[usa_carregado_boss] = relogio[usa_carregado_boss] + t_boss_charged_base + delay_rng[usa_carregado_boss]
                            energia_atacante[usa_carregado_boss] += np.ceil(dmg_boss_charged * 0.5)
                            
                            hp_atual[usa_fast_boss] -= dmg_boss_fast
                            energia_boss[usa_fast_boss] += boss_en_gain
                            prox_acao_boss[usa_fast_boss] = relogio[usa_fast_boss] + t_boss_fast_base + delay_rng[usa_fast_boss]
                            energia_atacante[usa_fast_boss] += np.ceil(dmg_boss_fast * 0.5)
                            
                        energia_atacante = np.clip(energia_atacante, 0, 100)
                        energia_boss = np.clip(energia_boss, 0, 100)
                        
                        # --- QUANDO O JOGADOR MORRE ---
                        morto = active & (hp_atual <= 0) & (hp_boss > 0)
                        if np.any(morto):
                            mortes_totais[morto] += 1
                            hp_atual[morto] = attacker_hp_max
                            energia_atacante[morto] = 0
                            relogio[morto] += 1.0
                            prox_acao_atacante[morto] = relogio[morto] + 0.5
                            prox_acao_boss[morto] = np.maximum(prox_acao_boss[morto], relogio[morto])
                            
                            wipe = morto & (mortes_totais % 6 == 0)
                            relogio[wipe] += 15.0
                            energia_boss[wipe] = 0
                            prox_acao_boss[wipe] = relogio[wipe] + 2.0
                            prox_acao_atacante[wipe] = relogio[wipe] + 0.5
                            
                    # =========================================================
                    # CÁLCULOS FINAIS RÁPIDOS DA MATRIZ DE 500 LUTAS
                    # =========================================================
                    hp_boss = np.clip(hp_boss, 0, None)
                    dano_total_luta = float(oponente["baseStats"]["hp"]) - hp_boss
                    ttw_luta = relogio
                    tempo_na_raid = np.minimum(ttw_luta, float(tempo_maximo_raid))
                    
                    # Evita divisão por zero
                    safe_tempo_na_raid = np.where(tempo_na_raid > 0, tempo_na_raid, 1)
                    safe_ttw_luta = np.where(ttw_luta > 0, ttw_luta, 1)
                    div_mortes = np.maximum(1, mortes_totais)

                    dps_da_luta = np.where(tempo_na_raid > 0, dano_total_luta / safe_tempo_na_raid, 0)
                    mortes_da_luta = np.where(ttw_luta > 0, (mortes_totais / safe_ttw_luta) * tempo_maximo_raid, 0)
                    tdo_da_luta = dps_da_luta * (ttw_luta / div_mortes)
                    
                    dps_medio_cenario = float(np.mean(dps_da_luta))
                    mortes_medio_cenario = float(np.mean(mortes_da_luta))
                    tdo_medio_cenario = float(np.mean(tdo_da_luta))
                    
                    ttw_medio = (oponente["baseStats"]["hp"] / max(0.1, dps_medio_cenario)) + (mortes_medio_cenario * 2) + (math.floor(mortes_medio_cenario/6) * 15)
                    estimador_medio = ttw_medio / tempo_maximo_raid
                    dano_no_tempo_limpo = min(oponente["baseStats"]["hp"], dps_medio_cenario * tempo_maximo_raid)

                    soma_dps_geral += dps_medio_cenario
                    soma_tdo_geral += tdo_medio_cenario
                    soma_dano_total_geral += dano_no_tempo_limpo
                    soma_estimador += estimador_medio
                    simulacoes_validas += 1

                    # Mínimos e Máximos reais das 500 lutas
                    dps_min_cenario = float(np.min(dps_da_luta))
                    dps_max_cenario = float(np.max(dps_da_luta))
                    if dps_min_cenario < dps_min: dps_min = dps_min_cenario
                    if dps_max_cenario > dps_max: dps_max = dps_max_cenario
                    
                    mortes_min_cenario = float(np.min(mortes_da_luta))
                    mortes_max_cenario = float(np.max(mortes_da_luta))
                    if mortes_min_cenario < mortes_min: mortes_min = mortes_min_cenario
                    if mortes_max_cenario > mortes_max: mortes_max = mortes_max_cenario

            if simulacoes_validas > 0:
                dps_medio_final = soma_dps_geral / simulacoes_validas
                dano_total_medio_final = soma_dano_total_geral / simulacoes_validas
                dano_perc = (dano_total_medio_final / oponente["baseStats"]["hp"]) * 100
                
                combos.append({
                    "id": pokemon["speciesId"],
                    "name": pokemon["speciesName"],
                    "f": fast_move["moveId"],
                    "c": charged_move["moveId"],
                    "dps": round(dps_medio_final, 1),
                    "dpsMin": round(dps_min, 1),
                    "dpsMax": round(dps_max, 1),
                    "dmgPerc": min(100.0, round(dano_perc, 1)),
                    "deathsMin": math.floor(mortes_min),
                    "deathsMax": math.ceil(mortes_max),
                    "tdo": round(soma_tdo_geral / simulacoes_validas),
                    "est": round(soma_estimador / simulacoes_validas, 2)
                })

    # Organiza do maior dano pro menor
    combos.sort(key=lambda x: x["dmgPerc"], reverse=True)
    return combos

# =====================================================================
# 5. GERENCIADOR DE DADOS E EXECUÇÃO
# =====================================================================
def baixar_json(url):
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def run_python_simulator(boss_name, tier):
    print("\n📥 [1/4] Baixando banco de dados...")
    try:
        main_data = baixar_json(URLS["MAIN_DATA"])
        mega_data = baixar_json(URLS["MEGA_DATA"])
        giga_data = baixar_json(URLS["GIGAMAX_DATA"])
        type_ef = baixar_json(URLS["TYPE_EFFECTIVENESS"])
        fast_moves = baixar_json(URLS["MOVES_GYM_FAST"])
        charged_moves = baixar_json(URLS["MOVES_GYM_CHARGED"])
        moves_obj = baixar_json(URLS["MOVE_DATA"])
    except Exception as e:
        print(f"❌ Erro ao baixar dados: {e}")
        return

    todos_pokes = main_data + mega_data + giga_data
    
    # 🛡️ O ESCUDO ANTI-KEYERROR AQUI
    GLOBAL_POKE_DB["dadosEficacia"] = type_ef
    GLOBAL_POKE_DB["gymFastMap"] = {m["moveId"]: m for m in fast_moves if isinstance(m, dict) and "moveId" in m}
    GLOBAL_POKE_DB["gymChargedMap"] = {m["moveId"]: m for m in charged_moves if isinstance(m, dict) and "moveId" in m}
    GLOBAL_POKE_DB["moveDataObjMap"] = {m["moveId"]: m for m in moves_obj if isinstance(m, dict) and "moveId" in m}

    print("✅ [2/4] Banco de Dados Carregado na Memória!")

    atacantes_vip = []
    for p in todos_pokes:
        if not p.get("baseStats") or "Purified" in p["speciesName"] or p["speciesName"] in ["Smeargle", "Ditto"]:
            continue
        
        atk50 = p["baseStats"].get("atk", 10) + 15
        def50 = p["baseStats"].get("def", 10) + 15
        hp50 = p["baseStats"].get("hp", 10) + 15
        max_cp = math.floor((atk50 * math.sqrt(def50) * math.sqrt(hp50) * (0.8403 * 0.8403)) / 10)
        
        if max_cp >= 2000 or p["baseStats"].get("atk", 0) >= 250:
            atacantes_vip.append(p)

    print(f"🎯 [3/4] Ficaram {len(atacantes_vip)} Pokémons de Elite aptos para a simulação!\n")

    boss_data = next((p for p in todos_pokes if p["speciesName"].lower() == boss_name.lower()), None)
    if not boss_data:
        print(f"❌ Boss '{boss_name}' não encontrado!")
        return

    nome_limpo = boss_name.lower().replace(" ", "_")
    fast_boss = boss_data.get("fastMoves") or ["TACKLE_FAST"]
    charged_boss = boss_data.get("chargedMoves") or ["STRUGGLE"]

    cenarios = [{"sufixo": "average", "fast": fast_boss, "charged": charged_boss}]
    for f in fast_boss:
        for c in charged_boss:
            cenarios.append({"sufixo": f"{f}_{c}".lower(), "fast": [f], "charged": [c]})

    hp_boss = 15000 if tier == "5" else 9000
    tempo_boss = 300

    dados_agrupados = {}

    print(f"⏱️ [4/4] Iniciando Cronômetro e o NumPy Turbo...")
    start_time = time.time()

    for cenario in cenarios:
        print(f"  ⚙️  Calculando cenário: {cenario['sufixo']}...")
        oponente = {
            "tipos": boss_data.get("types", ["Normal"]),
            "baseStats": {"atk": boss_data["baseStats"]["atk"], "def": boss_data["baseStats"]["def"], "hp": hp_boss},
            "fastMoves": cenario["fast"],
            "chargedMoves": cenario["charged"]
        }

        resultados = []
        total = len(atacantes_vip)
        
        for i, atacante in enumerate(atacantes_vip):
            # Barrinha voando!
            if i % 1 == 0 or i == total - 1:
                pct = int(((i+1)/total) * 100)
                print(f"      🚀 Processando com NumPy: {i+1}/{total} [{pct}%]   ", end='\r')

            if atacante["speciesId"] == boss_data["speciesId"]: continue
            
            combos = calcular_melhores_combos_numpy(atacante, oponente, tempo_boss)
            if combos:
                resultados.extend(combos)
        
        print() 

        if resultados:
            # Pandas para agrupar e ordenar o TOP 30 super rápido
            df = pd.DataFrame(resultados)
            
            # Pega o melhor DPS/Dano por Pokémon
            idx_best = df.groupby('id')['dmgPerc'].idxmax()
            df_best = df.loc[idx_best].sort_values(by='dmgPerc', ascending=False)
            
            # Pega os Top 30 IDs
            top30_ids = df_best.head(30)['id'].tolist()
            
            # Filtra apenas os golpes dos Top 30 e reordena
            df_final = df[df['id'].isin(top30_ids)].sort_values(by=['dmgPerc', 'dps'], ascending=[False, False])
            
            # Converte de volta para dicionário padrão
            finais = df_final.to_dict(orient='records')
            dados_agrupados[cenario["sufixo"]] = finais

    arquivo_saida = os.path.join(pasta_destino, f"counters_{nome_limpo}_t{tier}.json")
    
    # 🌟 AQUI ESTÁ O JSON "BONITINHO" FORMATADO
    with open(arquivo_saida, 'w', encoding='utf-8') as f:
        json.dump(dados_agrupados, f, indent=4, ensure_ascii=False)

    end_time = time.time()
    tempo_execucao = round(end_time - start_time, 2)
    tamanho_kb = round(os.path.getsize(arquivo_saida) / 1024, 1)

    print(f"\n✅ SUCESSO ABSOLUTO!")
    print(f"⏱️ Tempo de Execução do Motor: {tempo_execucao} segundos.")
    print(f"💾 Arquivo Salvo: {arquivo_saida}")
    print(f"📦 Tamanho: {tamanho_kb} KB")

# Inicializador Terminal
if __name__ == "__main__":
    print("====================================================")
    print("🐍 GERADOR DE COUNTERS PVE (NUMPY + PANDAS TURBO) 🐍")
    print("====================================================")
    
    boss_input = input("🔥 Qual Boss você quer simular? (Deixe vazio para Mewtwo): ").strip()
    if not boss_input: boss_input = "Mewtwo"
    
    tier_input = input("⚔️ Qual o Tier da Reide? (Deixe vazio para 5): ").strip()
    if not tier_input: tier_input = "5"
    
    run_python_simulator(boss_input, tier_input)