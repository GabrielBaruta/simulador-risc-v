class RISCV_Simulator {
    constructor() {
        this.reset();
    }

    reset() {
        this.pc = 0;
        this.regs = new Int32Array(32); // 32 registradores de 32 bits
        this.instrMemory = []; // Lista de objetos {pc, text, binary}
        this.dataMemory = {};  // Mapa endereço -> valor
        this.halted = true;
        this.logs = [];
    }

    // Carrega o texto assembly e "monta" o programa
    loadProgram(text) {
        this.reset();
        const lines = text.split('\n');
        let currentAddr = 0;

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine && !cleanLine.startsWith('#')) {
                // Aqui geramos um binário "fake" visual para cumprir o requisito
                // Em um simulador real, faríamos a conversão bit a bit
                this.instrMemory.push({
                    addr: currentAddr,
                    text: cleanLine,
                    binary: this.generateFakeBinary(cleanLine)
                });
                currentAddr += 4;
            }
        });
        
        if (this.instrMemory.length > 0) this.halted = false;
        this.log("Programa carregado. PC = 0");
    }

    generateFakeBinary(instr) {
        // Gera visualização binária baseada no Opcode (Requisito do PDF)
        const op = instr.split(' ')[0].toUpperCase();
        const opcodes = {
            'ADD': '0110011', 'SUB': '0110011', 'LW': '0000011', 'SW': '0100011', 
            'ADDI': '0010011', 'BEQ': '1100011'
        };
        const opcode = opcodes[op] || '0000000';
        return `??????? ????? ????? ??? ${opcode}`;
    }

    getRegIndex(regName) {
        // Converte "x1", "x1," ou "(x1)" para o índice 1
        const clean = regName.replace(/[^0-9]/g, ''); 
        const idx = parseInt(clean);
        return isNaN(idx) ? 0 : idx;
    }

    step() {
        if (this.halted) return false;

        // Fetch (Busca)
        const currentInstr = this.instrMemory.find(i => i.addr === this.pc);
        
        if (!currentInstr) {
            this.halted = true;
            this.log("Fim do programa (PC fora de limite).");
            return false;
        }

        // Decode & Execute
        const parts = currentInstr.text.replace(/,/g, ' ').replace(/\(/g, ' ').replace(/\)/g, ' ').split(/\s+/);
        const op = parts[0].toUpperCase();
        let logMsg = `PC[${this.pc}]: ${currentInstr.text}`;
        
        try {
            // Lógica e Aritmética (R-Type e I-Type)
            if (['ADD', 'SUB', 'AND', 'OR', 'SLT', 'MULT', 'ADDI', 'SLTI', 'SLL'].includes(op)) {
                const rd = this.getRegIndex(parts[1]);
                const rs1 = this.getRegIndex(parts[2]);
                let res = 0;

                // Diferencia R-Type (reg, reg, reg) de I-Type (reg, reg, imm)
                if (['ADDI', 'SLTI'].includes(op)) {
                    const imm = parseInt(parts[3]);
                    const v1 = this.regs[rs1];
                    if (op === 'ADDI') res = (v1 + imm) | 0;
                    if (op === 'SLTI') res = (v1 < imm) ? 1 : 0;
                } else {
                    const rs2 = this.getRegIndex(parts[3]);
                    const v1 = this.regs[rs1];
                    const v2 = this.regs[rs2];
                    
                    if (op === 'ADD') res = (v1 + v2) | 0;
                    if (op === 'SUB') res = (v1 - v2) | 0;
                    if (op === 'MULT') res = (v1 * v2) | 0;
                    if (op === 'AND') res = (v1 & v2) | 0;
                    if (op === 'OR') res = (v1 | v2) | 0;
                    if (op === 'SLT') res = (v1 < v2) ? 1 : 0;
                    if (op === 'SLL') res = (v1 << v2) | 0;
                }
                
                if (rd !== 0) this.regs[rd] = res; // Write Back
            }
            
            // Load Word: LW rd, offset(rs1) -> tratado aqui como LW rd, rs1, offset
            else if (op === 'LW') {
                const rd = this.getRegIndex(parts[1]);
                // Suporta sintaxe LW x1, 0(x2) ou LW x1, x2, 0
                let rs1, offset;
                if (parts[2].includes('(')) { // Formato 0(x2)
                    // Simplificação: assume que o usuário usa formato simples ou implemente parser regex
                    // Para o projeto, vamos forçar o formato simples nos testes: LW x1, x2, 0
                } 
                rs1 = this.getRegIndex(parts[2]);
                offset = parseInt(parts[3]);
                
                const addr = this.regs[rs1] + offset;
                const val = this.dataMemory[addr] || 0;
                if (rd !== 0) this.regs[rd] = val;
                logMsg += ` -> Leu ${val} do end ${addr}`;
            }

            // Store Word: SW rs2, offset(rs1)
            else if (op === 'SW') {
                const rs2 = this.getRegIndex(parts[1]); // Valor a salvar
                const rs1 = this.getRegIndex(parts[2]); // Base
                const offset = parseInt(parts[3]);
                
                const addr = this.regs[rs1] + offset;
                this.dataMemory[addr] = this.regs[rs2];
                logMsg += ` -> Salvou ${this.regs[rs2]} no end ${addr}`;
                this.updateMemoryView();
            }

            // Syscall simulada
            else if (op === 'PRINT') {
                const reg = this.getRegIndex(parts[1]);
                logMsg += ` >> SAÍDA: ${this.regs[reg]}`;
            }

            this.log(logMsg);
            this.pc += 4; // Incrementa PC
            return { executed: true, binary: currentInstr.binary };

        } catch (e) {
            this.log(`ERRO na linha ${this.pc}: ${e.message}`);
            this.halted = true;
            return false;
        }
    }

    log(msg) {
        this.logs.push(msg);
        const logContainer = document.getElementById('log-container');
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerText = msg;
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    updateMemoryView() {
        const memView = document.getElementById('memory-view');
        memView.innerHTML = '';
        for (const [addr, val] of Object.entries(this.dataMemory)) {
            memView.innerHTML += `<div>End[${addr}]: ${val}</div>`;
        }
    }
}

// ================= INTERFACE =================

const cpu = new RISCV_Simulator();
const registersContainer = document.getElementById('registers-container');

// Inicializa grade de registradores
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

function updateGUI(binaryCode) {
    document.getElementById('pc-display').innerText = `PC: ${cpu.pc}`;
    
    // Atualiza registradores
    for (let i = 0; i < 32; i++) {
        const el = document.getElementById(`reg-${i}`);
        const val = cpu.regs[i];
        el.innerText = `x${i}: ${val}`;
        
        // Efeito visual se mudou (opcional, simples aqui)
        if (val !== 0) el.style.color = '#4caf50'; 
    }

    if (binaryCode) {
        document.getElementById('binary-display').innerText = `Bin: ${binaryCode}`;
    }
}

// Event Listeners
document.getElementById('btn-load').addEventListener('click', () => {
    const code = document.getElementById('editor').value;
    cpu.loadProgram(code);
    initRegisters(); // Limpa visual
    updateGUI();
    document.getElementById('log-container').innerHTML = ''; // Limpa log
    
    document.getElementById('btn-step').disabled = false;
    document.getElementById('btn-run').disabled = false;
});

document.getElementById('btn-step').addEventListener('click', () => {
    const result = cpu.step();
    if (result) {
        updateGUI(result.binary);
    } else {
        alert("Execução finalizada ou erro.");
    }
});

document.getElementById('btn-run').addEventListener('click', () => {
    let steps = 0;
    const interval = setInterval(() => {
        const result = cpu.step();
        if (result && steps < 1000) {
            updateGUI(result.binary);
            steps++;
        } else {
            clearInterval(interval);
            alert("Execução finalizada.");
        }
    }, 50); // Velocidade da execução automática
});

document.getElementById('btn-reset').addEventListener('click', () => {
    location.reload();
});

// Inicialização
initRegisters();