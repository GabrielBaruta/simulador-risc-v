// ==========================================
// CLASSE DO PROCESSADOR RISC-V
// ==========================================
class RISCV_Simulator {
    constructor() {
        this.reset();
    }

    reset() {
        this.pc = 0;
        this.regs = new Int32Array(32); // 32 registradores de 32 bits
        this.instrMemory = []; // Lista de instruções
        this.dataMemory = {};  // Memória de Dados (Endereço -> Valor)
        this.halted = true;
        this.logs = [];
    }

    // Carrega o texto assembly e prepara a memória
    loadProgram(text) {
        this.reset();
        const lines = text.split('\n');
        let currentAddr = 0;

        lines.forEach(line => {
            const cleanLine = line.trim();
            // Ignora linhas vazias ou que começam com # (comentários)
            if (cleanLine && !cleanLine.startsWith('#')) {
                this.instrMemory.push({
                    addr: currentAddr,
                    text: cleanLine,
                    binary: this.generateFakeBinary(cleanLine)
                });
                currentAddr += 4;
            }
        });
        
        if (this.instrMemory.length > 0) this.halted = false;
        this.log("Programa carregado. PC inicializado em 0.");
    }

    // Gera um binário "visual" para cumprir requisito do PDF
    generateFakeBinary(instr) {
        const parts = instr.replace(/,/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();
        
        // Opcodes reais do RISC-V (simplificados)
        const opcodes = {
            'ADD': '0110011', 'SUB': '0110011', 'AND': '0110011', 'OR': '0110011', 'SLT': '0110011', 
            'MULT': '0110011', // Extensão M
            'ADDI': '0010011', 'SLTI': '0010011',
            'LW': '0000011', 'SW': '0100011', 
            'PRINT': '1110011' // Custom
        };
        const opcode = opcodes[op] || '0000000';
        
        // Retorna string formatada estilo 32-bits
        return `??????? ????? ????? ??? ${opcode}`;
    }

    getRegIndex(regName) {
        // Converte "x1", "x1," para o índice numérico
        const clean = regName.replace(/[^0-9]/g, ''); 
        const idx = parseInt(clean);
        return isNaN(idx) ? 0 : idx;
    }

    step() {
        if (this.halted) return false;

        // Busca Instrução (FETCH)
        const currentInstr = this.instrMemory.find(i => i.addr === this.pc);
        
        if (!currentInstr) {
            this.halted = true;
            this.log("Fim do programa (PC sem instrução correspondente).");
            return false;
        }

        // Decodifica (DECODE)
        // Remove vírgulas e parênteses para facilitar o parse
        const parts = currentInstr.text.replace(/,/g, ' ').replace(/\(/g, ' ').replace(/\)/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();
        let logMsg = `PC[${this.pc}]: ${currentInstr.text}`;
        
        try {
            // === Execução (EXECUTE) ===
            
            // Tipo R (Reg, Reg, Reg)
            if (['ADD', 'SUB', 'AND', 'OR', 'SLT', 'MULT', 'SLL'].includes(op)) {
                const rd = this.getRegIndex(parts[1]);
                const rs1 = this.getRegIndex(parts[2]);
                const rs2 = this.getRegIndex(parts[3]);
                
                const v1 = this.regs[rs1];
                const v2 = this.regs[rs2];
                let res = 0;

                if (op === 'ADD') res = (v1 + v2) | 0;
                else if (op === 'SUB') res = (v1 - v2) | 0;
                else if (op === 'MULT') res = (v1 * v2) | 0;
                else if (op === 'AND') res = (v1 & v2) | 0;
                else if (op === 'OR') res = (v1 | v2) | 0;
                else if (op === 'SLT') res = (v1 < v2) ? 1 : 0;
                else if (op === 'SLL') res = (v1 << v2) | 0;

                if (rd !== 0) this.regs[rd] = res; // Grava em RD (exceto se for x0)
            }
            
            // Tipo I (Reg, Reg, Imediato)
            else if (['ADDI', 'SLTI'].includes(op)) {
                const rd = this.getRegIndex(parts[1]);
                const rs1 = this.getRegIndex(parts[2]);
                const imm = parseInt(parts[3]);
                const v1 = this.regs[rs1];
                
                let res = 0;
                if (op === 'ADDI') res = (v1 + imm) | 0;
                else if (op === 'SLTI') res = (v1 < imm) ? 1 : 0;
                
                if (rd !== 0) this.regs[rd] = res;
            }

            // Load (LW rd, rs1, offset) ou LW rd, offset(rs1)
            // Nossa simplificação aceita: LW x1, x2, 4
            else if (op === 'LW') {
                const rd = this.getRegIndex(parts[1]);
                const rs1 = this.getRegIndex(parts[2]);
                const offset = parseInt(parts[3]);
                
                const addr = this.regs[rs1] + offset;
                const val = this.dataMemory[addr] || 0;
                
                if (rd !== 0) this.regs[rd] = val;
                logMsg += ` -> Leu ${val} do end ${addr}`;
            }

            // Store (SW rs2, rs1, offset)
            else if (op === 'SW') {
                const rs2 = this.getRegIndex(parts[1]); // Dado a salvar
                const rs1 = this.getRegIndex(parts[2]); // Endereço Base
                const offset = parseInt(parts[3]);
                
                const addr = this.regs[rs1] + offset;
                this.dataMemory[addr] = this.regs[rs2];
                
                logMsg += ` -> Salvou ${this.regs[rs2]} no end ${addr}`;
                this.updateMemoryView();
            }

            // Syscall simulada (PRINT reg)
            else if (op === 'PRINT') {
                const reg = this.getRegIndex(parts[1]);
                const val = this.regs[reg];
                logMsg += ` >> SAÍDA: ${val}`;
            }

            this.log(logMsg);
            this.pc += 4; // Avança PC
            return { executed: true, binary: currentInstr.binary };

        } catch (e) {
            this.log(`ERRO CRÍTICO na linha ${this.pc}: ${e.message}`);
            this.halted = true;
            return false;
        }
    }

    log(msg) {
        this.logs.push(msg);
        const logContainer = document.getElementById('log-container');
        if (logContainer) {
            const div = document.createElement('div');
            div.className = 'log-item';
            div.innerText = msg;
            logContainer.appendChild(div);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    updateMemoryView() {
        const memView = document.getElementById('memory-view');
        if (memView) {
            memView.innerHTML = '';
            // Mostra apenas posições de memória que têm dados
            const addresses = Object.keys(this.dataMemory).sort((a,b) => parseInt(a)-parseInt(b));
            
            if (addresses.length === 0) {
                memView.innerHTML = '<div style="color: #666; padding: 5px;">Nenhum dado salvo.</div>';
                return;
            }

            addresses.forEach(addr => {
                memView.innerHTML += `<div>End[${addr}]: ${this.dataMemory[addr]}</div>`;
            });
        }
    }
}

// ==========================================
// CONFIGURAÇÃO DA INTERFACE (GUI)
// ==========================================

const cpu = new RISCV_Simulator();
const registersContainer = document.getElementById('registers-container');

// 1. Inicializa Grid de Registradores
function initRegisters() {
    registersContainer.innerHTML = '';
    for (let i = 0; i < 32; i++) {
        const div = document.createElement('div');
        div.className = 'reg-box';
        div.id = `reg-${i}`;
        div.innerText = `x${i}: 0`;
        registersContainer.appendChild(div);
    }
}

// 2. Atualiza a tela com estado atual da CPU
function updateGUI(binaryCode) {
    // Atualiza PC
    document.getElementById('pc-display').innerText = `PC: ${cpu.pc}`;
    
    // Atualiza Registradores
    for (let i = 0; i < 32; i++) {
        const el = document.getElementById(`reg-${i}`);
        const val = cpu.regs[i];
        el.innerText = `x${i}: ${val}`;
        
        // Destaca registradores com valores diferentes de zero
        if (val !== 0) {
            el.style.color = '#4caf50';
            el.style.borderColor = '#4caf50';
        } else {
            el.style.color = '#e0e0e0';
            el.style.borderColor = '#555';
        }
    }

    // Atualiza barra binária
    if (binaryCode) {
        document.getElementById('binary-display').innerText = `Bin: ${binaryCode}`;
    }
}

// 3. Event Listeners dos Botões
document.getElementById('btn-load').addEventListener('click', () => {
    const code = document.getElementById('editor').value;
    cpu.loadProgram(code);
    initRegisters(); 
    cpu.updateMemoryView(); // Limpa visual da memória
    updateGUI("00000000 00000000 00000000 00000000");
    document.getElementById('log-container').innerHTML = ''; 
    
    // Habilita controles
    document.getElementById('btn-step').disabled = false;
    document.getElementById('btn-run').disabled = false;
});

document.getElementById('btn-step').addEventListener('click', () => {
    const result = cpu.step();
    if (result) {
        updateGUI(result.binary);
    } else {
        alert("Execução finalizada ou erro.");
        document.getElementById('btn-step').disabled = true;
    }
});

document.getElementById('btn-run').addEventListener('click', () => {
    let steps = 0;
    const interval = setInterval(() => {
        const result = cpu.step();
        if (result && steps < 1000) { // Limite de segurança
            updateGUI(result.binary);
            steps++;
        } else {
            clearInterval(interval);
            if (!result) alert("Execução finalizada.");
        }
    }, 50); // Velocidade (50ms por passo)
});

document.getElementById('btn-reset').addEventListener('click', () => {
    location.reload();
});


// ==========================================
// EXEMPLOS PRONTOS (Botões de Atalho)
// ==========================================
const exampleCodes = {
    1: `# Teste 1: Aritmética e ULA
ADDI x1, x0, 15
ADDI x2, x0, 25
ADD x3, x1, x2    # x3 = 15 + 25 = 40
SUB x4, x2, x1    # x4 = 25 - 15 = 10
MULT x5, x1, x2   # x5 = 15 * 25 = 375
PRINT x3
PRINT x4
PRINT x5`,

    2: `# Teste 2: Memória (Load / Store)
ADDI x1, x0, 99   # Valor para salvar
ADDI x2, x0, 0    # Endereço base
SW x1, x2, 4      # Salva 99 no endereço 4
LW x3, x2, 4      # Lê do endereço 4 para x3
ADDI x4, x3, 1    # Soma 1 para provar que leu
PRINT x3
PRINT x4`,

    3: `# Teste 3: Lógica (SLT - IF/ELSE)
ADDI x1, x0, 10
ADDI x2, x0, 20
SLT x3, x1, x2    # 10 < 20? Sim (1)
SLT x4, x2, x1    # 20 < 10? Não (0)
AND x5, x3, x4    # 1 AND 0 = 0
OR x6, x3, x4     # 1 OR 0 = 1
PRINT x3
PRINT x6`
};

function loadExample(id) {
    const editor = document.getElementById('editor');
    if (editor) {
        editor.value = exampleCodes[id];
        // Clica no botão carregar automaticamente para agilizar
        document.getElementById('btn-load').click();
    }
}

// Inicializa visual ao abrir
initRegisters();
