import { GoogleGenAI, Type } from "@google/genai";
import type { RefuelingRequest, ScheduleItem, Priority, Location } from '../types';

// This interface defines the complete barge data structure required for the prompt.
export interface BargeForPrompt {
  id: string;
  name: string;
  initialLocation: Location;
  speed: number; // in knots
  products: {
    productType: string;
    capacity: number;
    currentVolume: number;
  }[];
}

export type RequestForPrompt = Omit<RefuelingRequest, 'id' | 'status' | 'locationId'> & { location: Location };


const scheduleSchema = {
  type: Type.OBJECT,
  properties: {
    schedule: {
      type: Type.ARRAY,
      description: "A programação gerada de operações de abastecimento.",
      items: {
        type: Type.OBJECT,
        properties: {
          shipName: {
            type: Type.STRING,
            description: "O nome do navio sendo abastecido. Se a barcaça estiver retornando para recarregar, deve ser 'TERMINAL'."
          },
          bargeName: {
            type: Type.STRING,
            description: "O nome da barcaça realizando a operação."
          },
          scheduledTime: {
            type: Type.STRING,
            description: "A data e hora agendadas para o início da operação no formato ISO 8601 (YYYY-MM-DDTHH:MM)."
          },
          product: {
            type: Type.STRING,
            description: "O tipo de produto sendo fornecido (VLSFO ou MGO). Se retornando ao terminal, este é o produto a ser recarregado."
          },
          quantity: {
            type: Type.NUMBER,
            description: "A quantidade de produto a ser fornecida. Deve ser 0 se estiver retornando ao terminal."
          },
          locationName: {
            type: Type.STRING,
            description: "O nome do local onde o serviço está ocorrendo. Para retornos ao terminal, deve ser 'TERMINAL'."
          }
        },
        required: ["shipName", "bargeName", "scheduledTime", "product", "quantity", "locationName"]
      }
    }
  },
  required: ["schedule"]
};

export const generateSchedule = async (barges: BargeForPrompt[], requests: RequestForPrompt[], priorities: Priority[], simulationStartTime: string): Promise<ScheduleItem[]> => {
  const API_key = process.env.API_KEY;

  if (!API_key) {
    console.error("API_KEY environment variable not set");
    throw new Error("CONFIGURAÇÃO NECESSÁRIA: A chave de API do Gemini não foi encontrada. Por favor, configure a variável de ambiente 'API_KEY' para continuar.");
  }

  const ai = new GoogleGenAI({ apiKey: API_key });
  
  if (barges.length === 0 || requests.length === 0) {
    return [];
  }

  const prioritiesText = priorities.map((p, index) => `${index + 1}. ${p.text}`).join('\n');

  const prompt = `
    Você é um programador de logística de classe mundial para operações de bunkering (abastecimento de navios) de um grande porto.
    Sua tarefa é criar uma programação eficiente e lógica para a frota de barcaças fornecida para atender a uma lista de solicitações de abastecimento, considerando tempos operacionais, locais e necessidades de recarga das barcaças.

    **Ponto de Partida da Programação:**
    - Todas as operações devem ser agendadas a partir do seguinte horário: ${simulationStartTime}.
    - O estado inicial das barcaças (localização e volumes) é válido para este exato momento. Qualquer cálculo de tempo de viagem ou serviço deve começar a partir desta data e hora.

    **Lógica de Estado Inicial Específica:**
    - **Barcaças Carregando no Píer:** Se o nome da localização inicial de uma barcaça for 'TERMINAL', considere que ela está em processo de carregamento no píer de barcaças.
    - **Cálculo de Liberação:** O tempo para ela ficar disponível para um novo serviço deve ser calculado da seguinte forma:
        1. Para cada produto que ela carrega, calcule o 'Tempo de Carregamento Restante' = (Capacidade Total do Produto - Volume Inicial do Produto) / 400. A vazão de carregamento do terminal é de 400 ton/hora.
        2. O tempo total que a barcaça ficará ocupada no píer é o **maior** 'Tempo de Carregamento Restante' entre seus produtos, acrescido de 2 horas para a 'Faina Final'.
        3. O horário em que a barcaça estará liberada ('Horário de Liberação') é: ${simulationStartTime} + Tempo Ocupado no Píer.
    - **Primeira Viagem:** O horário de chegada no primeiro atendimento para essa barcaça será o 'Horário de Liberação' dela somado ao tempo de viagem do 'TERMINAL' até o local do navio a ser atendido.
    - Para todas as outras barcaças que não estão no 'TERMINAL', elas estão prontas para navegar imediatamente a partir de ${simulationStartTime}.

    **Conceitos Principais:**
    - **Barcaças Híbridas:** As barcaças podem transportar múltiplos tipos de combustível (VLSFO, MGO), cada um com seu próprio tanque, capacidade e volume atual.
    - **Pedidos Multi-Produto:** Navios podem solicitar múltiplos tipos de combustível em uma única operação em um local específico.
    - **Preferência por Eficiência:** Sempre que possível, atenda pedidos multi-produto (navios que precisam de VLSFO e MGO) usando uma única barcaça híbrida. Este é o método mais eficiente.
    - **Eventos da Programação:** Um evento pode ser uma entrega a um navio ou um retorno ao terminal para recarga.

    **Prioridades de Agendamento (em ordem):**
    ${prioritiesText}

    **Regras de Cálculo de Tempo:**
    - **Taxa de Bombeamento:** Assuma uma taxa de bombeamento padrão de 300 toneladas por hora.
    - **Faina Inicial:** 1.5 horas antes do início do bombeamento.
    - **Faina Final:** 2 horas após o término do bombeamento.
    - **Velocidade da Barcaça:** Cada barcaça tem uma velocidade de navegação específica em nós (knots).
    - **Cálculo do Tempo de Viagem:** Você deve calcular o tempo de viagem entre diferentes locais. Use a fórmula de Haversine para encontrar a distância de grande círculo em milhas náuticas entre dois pontos, dadas suas latitudes e longitudes. O tempo de viagem em horas é então \`Distância / Velocidade da Barcaça\`. Arredonde o tempo de viagem para a meia hora mais próxima.
    - **Viagem Intra-Local:** O tempo de viagem entre serviços no *mesmo* local é considerado zero.
    - **Tempo Total de Serviço para uma entrega de produto:** 1.5h (inicial) + (Quantidade / 300) + 2h (final). O 'scheduledTime' na saída deve ser o início da faina inicial. Você deve considerar o tempo total de serviço + tempo de viagem calculado antes de agendar a próxima operação para a mesma barcaça.

    **Lógica de Recarga da Barcaça:**
    1.  Após cada entrega, você deve rastrear internamente o volume restante na barcaça.
    2.  Antes de atribuir um novo trabalho, verifique se a barcaça tem produto suficiente.
    3.  **CRÍTICO:** Se o volume restante de um produto em uma barcaça for menor que a menor quantidade de pedido pendente para esse mesmo produto, a barcaça não poderá atender mais nenhum pedido para esse produto. Ela deve retornar ao terminal.
    4.  Quando uma barcaça precisa recarregar, você deve gerar um item especial na programação:
        - shipName: "TERMINAL"
        - product: O tipo de produto que precisa recarregar.
        - quantity: 0
        - locationName: "TERMINAL"
    5.  A programação para essa barcaça só pode ser retomada após ela ter ido ao "TERMINAL". O tempo total para uma visita ao terminal é calculado como: 1.5 horas (faina inicial) + Tempo de Recarga + 2 horas (faina final). O Tempo de Recarga é calculado dinamicamente: (Capacidade do Produto da Barcaça - Volume Atual no momento do retorno) / 400. A taxa de carregamento do terminal é de 400 toneladas por hora.

    **Restrições e Regras:**
    - Um navio só pode ser atendido por uma barcaça de cada vez. Se um navio requer serviço de duas barcaças diferentes (para produtos diferentes), seus períodos de serviço não podem se sobrepor. A segunda barcaça só pode começar sua 'Faina Inicial' depois que a primeira barcaça tiver concluído totalmente sua 'Faina Final'.
    - Uma barcaça só pode fornecer um produto que ela transporta e para o qual tem volume suficiente.
    - O início do serviço ('scheduledTime', que é o começo da faina inicial) DEVE estar dentro da janela de abastecimento do navio (entre 'windowStart' e 'windowEnd'). O serviço em si pode terminar após o 'windowEnd'.
    - A programação de saída deve conter uma entrada separada para **CADA ENTREGA DE PRODUTO** e **CADA VISITA AO TERMINAL**.
    - Se um pedido multi-produto puder ser atendido por uma barcaça híbrida, isso é eficiente. Se uma barcaça híbrida não tiver volume suficiente para um pedido multi-produto, você deve então tentar agendar a entrega usando duas barcaças especializadas separadas.
    - Você deve agendar todos os pedidos de produtos possíveis.

    **Frota de Barcaças Disponível (Estado Inicial):**
    ${JSON.stringify(barges, null, 2)}

    **Pedidos de Abastecimento:**
    ${JSON.stringify(requests, null, 2)}

    Por favor, gere a programação ótima com base em todas essas regras. A saída deve ser um objeto JSON que adere ao schema fornecido.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: scheduleSchema,
      },
    });
    
    const jsonString = response.text;
    const parsedResponse = JSON.parse(jsonString);

    return parsedResponse.schedule || [];
  } catch (error) {
    console.error("Erro ao gerar programação:", error);
    throw new Error("Falha ao gerar a programação devido a um erro na API.");
  }
};