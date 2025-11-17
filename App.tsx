// FIX: Corrected the import statement for React and its hooks.
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Barge, RefuelingRequest, ScheduleItem, BargeState, ProductDetail, BargeProduct, BargeVolume, OperationHistoryItem, Priority, Location } from './types';
import { ProductType, RequestStatus } from './types';
import { generateSchedule } from './services/geminiService';
import type { BargeForPrompt, RequestForPrompt } from './services/geminiService';
import { ShipIcon, FuelIcon, CalendarIcon, ClockIcon, TrashIcon, PlusIcon, HistoryIcon, TerminalIcon, PencilIcon, CheckIcon, GripVerticalIcon, MapPinIcon, SpeedIcon, SaveIcon, LoadIcon, MapIcon, InfoIcon } from './components/IconComponents';

// --- Helper Functions ---
const formatDateTime = (isoString: string) => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Data Inválida";
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', '');
  } catch (e) {
    return "Data Inválida";
  }
};

const formatDate = (dateString: string) => {
  try {
    const [year, month, day] = dateString.split('-');
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (isNaN(date.getTime())) return "Data Inválida";
     return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch(e) {
    return "Data Inválida";
  }
}

// --- Card Component ---
interface CardProps {
  children: React.ReactNode;
  className?: string;
  title: string;
  icon: React.ReactNode;
}
const Card: React.FC<CardProps> = ({ children, className, title, icon }) => (
  <div className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-lg p-6 flex flex-col h-full ${className}`}>
    <div className="flex items-center gap-3 mb-4 flex-shrink-0">
      {icon}
      <h2 className="text-xl font-bold text-amber-400">{title}</h2>
    </div>
    <div className="flex-grow overflow-hidden">
        {children}
    </div>
  </div>
);

// --- Barge Setup Component ---
interface BargeSetupProps {
  barges: Barge[];
  setBarges: React.Dispatch<React.SetStateAction<Barge[]>>;
  setBargeStates: React.Dispatch<React.SetStateAction<BargeState[]>>;
  locations: Location[];
}
const BargeSetup: React.FC<BargeSetupProps> = ({ barges, setBarges, setBargeStates, locations }) => {
  const initialFormState = { name: '', vlsfoCapacity: 0, mgoCapacity: 0, speed: 4 };
  const [bargeForm, setBargeForm] = useState(initialFormState);
  const [editingBargeId, setEditingBargeId] = useState<string | null>(null);

  const handleFormChange = (field: keyof typeof bargeForm, value: string | number) => {
    const numericValue = typeof value === 'string' ? parseInt(value, 10) || 0 : value;
    setBargeForm(prev => ({ ...prev, [field]: field === 'name' ? value : numericValue }));
  };

  const startEditing = (barge: Barge) => {
    setEditingBargeId(barge.id);
    setBargeForm({
        name: barge.name,
        vlsfoCapacity: barge.products.find(p => p.productType === ProductType.VLSFO)?.capacity || 0,
        mgoCapacity: barge.products.find(p => p.productType === ProductType.MGO)?.capacity || 0,
        speed: barge.speed
    });
  };

  const cancelEditing = () => {
    setEditingBargeId(null);
    setBargeForm(initialFormState);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, vlsfoCapacity, mgoCapacity, speed } = bargeForm;
    if (!name.trim() || (vlsfoCapacity <= 0 && mgoCapacity <= 0) || speed <= 0) return;

    const products: BargeProduct[] = [];
    if (vlsfoCapacity > 0) products.push({ productType: ProductType.VLSFO, capacity: vlsfoCapacity });
    if (mgoCapacity > 0) products.push({ productType: ProductType.MGO, capacity: mgoCapacity });

    if (editingBargeId) {
        // Update logic
        setBarges(prev => prev.map(b => b.id === editingBargeId ? { id: b.id, name, products, speed } : b));
        setBargeStates(prevStates => prevStates.map(state => {
            if (state.bargeId !== editingBargeId) return state;

            const updatedVolumes: BargeVolume[] = [];
            products.forEach(newProduct => {
                const existingVolume = state.volumes.find(v => v.productType === newProduct.productType);
                if (existingVolume) {
                    updatedVolumes.push({
                        productType: newProduct.productType,
                        volume: Math.min(existingVolume.volume, newProduct.capacity)
                    });
                } else {
                    updatedVolumes.push({ productType: newProduct.productType, volume: 0 });
                }
            });
            return { ...state, volumes: updatedVolumes };
        }));
        cancelEditing();
    } else {
        // Add logic
        const newBargeData = { id: crypto.randomUUID(), name, products, speed };
        setBarges(prev => [...prev, newBargeData]);
        const initialVolumes: BargeVolume[] = products.map(p => ({
            productType: p.productType,
            volume: Math.floor(p.capacity * 0.75)
        }));
        setBargeStates(prev => [...prev, { bargeId: newBargeData.id, volumes: initialVolumes, locationId: locations.find(l=>l.name === 'TERMINAL')?.id || '' }]);
        setBargeForm(initialFormState);
    }
  };

  const removeBarge = (id: string) => {
    setBarges(barges.filter(b => b.id !== id));
    setBargeStates(prev => prev.filter(bs => bs.bargeId !== id));
    if (editingBargeId === id) {
        cancelEditing();
    }
  };
  
  return (
    <Card title="Frota de Barcaças" icon={<FuelIcon className="w-7 h-7 text-amber-400" />}>
      <div className="h-full flex flex-col">
          <form onSubmit={handleFormSubmit} className="space-y-4 mb-6 text-sm flex-shrink-0 p-4 bg-white/5 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="Nome da Barcaça" value={bargeForm.name} onChange={e => handleFormChange('name', e.target.value)} className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none col-span-1" required />
               <div>
                  <label className="text-xs text-gray-300">Velocidade (nós)</label>
                  <input type="number" placeholder="4" value={bargeForm.speed || ''} onChange={e => handleFormChange('speed', e.target.value)} className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-gray-300">Capacidade VLSFO (ton)</label>
                    <input type="number" placeholder="0" value={bargeForm.vlsfoCapacity || ''} onChange={e => handleFormChange('vlsfoCapacity', e.target.value)} className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                </div>
                <div>
                    <label className="text-xs text-gray-300">Capacidade MGO (ton)</label>
                    <input type="number" placeholder="0" value={bargeForm.mgoCapacity || ''} onChange={e => handleFormChange('mgoCapacity', e.target.value)} className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                </div>
            </div>
            <div className="flex gap-2">
                <button type="submit" className="flex-grow bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-bold py-2 px-4 rounded-md transition-all duration-300 flex items-center justify-center gap-2">
                    {editingBargeId ? <CheckIcon className="w-5 h-5"/> : <PlusIcon className="w-5 h-5" />}
                    {editingBargeId ? 'Salvar Alterações' : 'Adicionar Barcaça à Frota'}
                </button>
                {editingBargeId && (
                    <button type="button" onClick={cancelEditing} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition-colors">
                        Cancelar
                    </button>
                )}
            </div>
          </form>
           <div className="space-y-3 overflow-y-auto pr-2 flex-grow">
            {barges.map(barge => (
              <div key={barge.id} className={`bg-white/5 p-3 rounded-lg text-sm flex justify-between items-center transition-all ${editingBargeId === barge.id ? 'ring-2 ring-amber-500' : ''}`}>
                <div>
                  <p className="font-bold text-gray-200">{barge.name}</p>
                  <div className="flex gap-2 mt-1 items-center">
                     {barge.products.map(p => (
                        <span key={p.productType} className="text-xs font-normal bg-teal-500/20 text-teal-200 px-2 py-0.5 rounded-full">{p.productType}: {p.capacity}t</span>
                     ))}
                     <span className="text-xs font-normal bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <SpeedIcon className="w-3 h-3"/> {barge.speed} kn
                     </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => startEditing(barge)} className="text-amber-500 hover:text-amber-400 p-1 rounded-full transition-colors"><PencilIcon className="w-4 h-4"/></button>
                    <button onClick={() => removeBarge(barge.id)} className="text-gray-500 hover:text-rose-400 p-1 rounded-full transition-colors"><TrashIcon className="w-5 h-5"/></button>
                </div>
              </div>
            ))}
          </div>
      </div>
    </Card>
  );
};

// --- Barge Initial State Component ---
interface BargeInitialStateProps {
    barges: Barge[];
    bargeStates: BargeState[];
    setBargeStates: React.Dispatch<React.SetStateAction<BargeState[]>>;
    locations: Location[];
    simulationStartTime: string;
    setSimulationStartTime: React.Dispatch<React.SetStateAction<string>>;
}
const BargeInitialState: React.FC<BargeInitialStateProps> = ({ barges, bargeStates, setBargeStates, locations, simulationStartTime, setSimulationStartTime }) => {
    
    const handleVolumeChange = (bargeId: string, productType: ProductType, value: number) => {
        setBargeStates(currentStates =>
            currentStates.map(state => {
                if (state.bargeId === bargeId) {
                    const newVolumes = state.volumes.map(vol => 
                        vol.productType === productType ? { ...vol, volume: value } : vol
                    );
                    return { ...state, volumes: newVolumes };
                }
                return state;
            })
        );
    };
    
    const handleLocationChange = (bargeId: string, value: string) => {
         setBargeStates(currentStates =>
            currentStates.map(state =>
                state.bargeId === bargeId ? { ...state, locationId: value } : state
            )
        );
    };

    return (
        <Card title="Cenário inicial das Barcaças" icon={<ClockIcon className="w-7 h-7 text-amber-400" />}>
            <div className="space-y-4 overflow-y-auto pr-2 h-full">
                 <div className="p-4 bg-white/5 rounded-lg">
                    <label htmlFor="simulation-start-time" className="text-sm text-gray-200 font-semibold mb-2 block">
                        Início da Simulação
                    </label>
                    <input
                        id="simulation-start-time"
                        type="datetime-local"
                        value={simulationStartTime}
                        onChange={e => setSimulationStartTime(e.target.value)}
                        className="w-full bg-white/10 text-white p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                     <p className="text-xs text-gray-400 mt-2">Este é o ponto de partida para todos os cálculos de agendamento.</p>
                </div>

                {barges.length === 0 && (
                    <div className="text-center text-gray-400 p-4">
                        <p>Defina as barcaças na seção "Frota de Barcaças" para configurar seu estado inicial aqui.</p>
                    </div>
                )}
                {barges.map(barge => {
                    const state = bargeStates.find(s => s.bargeId === barge.id);
                    if (!state) return null;
                    return (
                        <div key={barge.id} className="bg-white/5 p-3 rounded-lg text-sm space-y-3">
                            <p className="font-bold text-gray-200">{barge.name}</p>
                             <div className="space-y-2">
                               {state.volumes.map(vol => {
                                   const maxCapacity = barge.products.find(p => p.productType === vol.productType)?.capacity || 0;
                                   return (
                                     <div key={vol.productType}>
                                       <label className="text-xs text-gray-300">Volume Atual de {vol.productType} (ton) / Máx: {maxCapacity}t</label>
                                       <input 
                                          type="number" 
                                          value={vol.volume} 
                                          max={maxCapacity}
                                          onChange={e => handleVolumeChange(barge.id, vol.productType, Math.min(parseInt(e.target.value, 10) || 0, maxCapacity))}
                                          className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                       />
                                     </div>
                                   )
                               })}
                            </div>
                            <div>
                                <label className="text-xs text-gray-300">Localização Inicial</label>
                                <select 
                                    value={state.locationId} 
                                    onChange={e => handleLocationChange(barge.id, e.target.value)}
                                    className="w-full bg-white/10 text-white p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-50"
                                    disabled={locations.length === 0}
                                >
                                    {locations.length === 0 ? (
                                        <option>Por favor, adicione locais primeiro</option>
                                    ) : (
                                        locations.map(loc => (
                                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                                        ))
                                    )}
                                </select>
                            </div>
                        </div>
                    )
                })}
            </div>
        </Card>
    );
};


// --- Requests Table Component ---
interface RequestsTableProps {
  requests: RefuelingRequest[];
  setRequests: React.Dispatch<React.SetStateAction<RefuelingRequest[]>>;
  locations: Location[];
}

// FIX: Define a type for column widths for type safety in resizing logic
type RequestColWidths = {
    shipName: number;
    location: number;
    vlsfo: number;
    mgo: number;
    windowStart: number;
    windowEnd: number;
    contractDate: number;
    status: number;
    actions: number;
};

const RequestsTable: React.FC<RequestsTableProps> = ({ requests, setRequests, locations }) => {
    const serviceableLocations = useMemo(() => locations.filter(l => l.name.toUpperCase() !== 'TERMINAL'), [locations]);
    const today = new Date().toISOString().split('T')[0];
    const initialNewRequest = { shipName: '', vlsfoQuantity: 0, mgoQuantity: 0, windowStart: '', windowEnd: '', contractualDate: today, status: RequestStatus.Confirmed, locationId: serviceableLocations[0]?.id || '' };
    
    const [newRequest, setNewRequest] = useState(initialNewRequest);
    const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
    const [editedRequest, setEditedRequest] = useState<RefuelingRequest | null>(null);

    const [colWidths, setColWidths] = useState<RequestColWidths>({
        shipName: 200,
        location: 150,
        vlsfo: 80,
        mgo: 80,
        windowStart: 200,
        windowEnd: 200,
        contractDate: 150,
        status: 120,
        actions: 100,
    });
    const resizingColKey = useRef<keyof RequestColWidths | null>(null);
    const startX = useRef(0);
    const tableRef = useRef<HTMLTableElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent, colKey: keyof RequestColWidths) => {
        resizingColKey.current = colKey;
        startX.current = e.clientX;
        
        const handleMouseMove = (event: MouseEvent) => {
            if (!resizingColKey.current) return;
            const currentX = event.clientX;
            const deltaX = currentX - startX.current;
            
            setColWidths(prevWidths => {
                if (!resizingColKey.current) return prevWidths;
                const newWidth = (prevWidths[resizingColKey.current] || 0) + deltaX;
                return {
                    ...prevWidths,
                    [resizingColKey.current]: Math.max(newWidth, 50), // min width 50px
                };
            });
            startX.current = currentX;
        };

        const handleMouseUp = () => {
            resizingColKey.current = null;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, []);

    const requestTableHeaders = useMemo(() => [
        { key: 'shipName', label: 'Nome do Navio' },
        { key: 'location', label: 'Local' },
        { key: 'vlsfo', label: 'VLSFO' },
        { key: 'mgo', label: 'MGO' },
        { key: 'windowStart', label: 'Início da Janela' },
        { key: 'windowEnd', label: 'Fim da Janela' },
        { key: 'contractDate', label: 'Data Contratual' },
        { key: 'status', label: 'Status' },
        { key: 'actions', label: 'Ações' },
    ] as const, []);

    useEffect(() => {
      if (!serviceableLocations.some(l => l.id === newRequest.locationId)) {
        setNewRequest(prev => ({...prev, locationId: serviceableLocations[0]?.id || ''}))
      }
    }, [serviceableLocations, newRequest.locationId]);

    const handleAddRequest = (e: React.FormEvent) => {
        e.preventDefault();
        const { shipName, vlsfoQuantity, mgoQuantity, windowStart, windowEnd, contractualDate, locationId, status } = newRequest;
        if (shipName && (vlsfoQuantity > 0 || mgoQuantity > 0) && windowStart && windowEnd && contractualDate && locationId) {
            const products: ProductDetail[] = [];
            if (vlsfoQuantity > 0) products.push({ productType: ProductType.VLSFO, quantity: vlsfoQuantity });
            if (mgoQuantity > 0) products.push({ productType: ProductType.MGO, quantity: mgoQuantity });

            setRequests(prev => [...prev, { id: crypto.randomUUID(), shipName, products, windowStart, windowEnd, contractualDate, status, locationId }]);
            setNewRequest(initialNewRequest);
        }
    };
    
    const removeRequest = (id: string) => {
      setRequests(requests.filter(r => r.id !== id));
    };

    const startEditing = (request: RefuelingRequest) => {
        setEditingRequestId(request.id);
        setEditedRequest({ ...request });
    };
    
    const cancelEditing = () => {
        setEditingRequestId(null);
        setEditedRequest(null);
    };

    const saveEditing = () => {
        if (!editedRequest) return;
        setRequests(requests.map(r => r.id === editedRequest.id ? editedRequest : r));
        cancelEditing();
    };

    const handleEditChange = (field: keyof RefuelingRequest, value: any) => {
        if (editedRequest) {
            setEditedRequest({ ...editedRequest, [field]: value });
        }
    };

    const handleProductEditChange = (productType: ProductType, quantity: number) => {
        if (!editedRequest) return;

        const otherProducts = editedRequest.products.filter(p => p.productType !== productType);
        const newProducts = [...otherProducts];
        if (quantity > 0) {
            newProducts.push({ productType, quantity });
        }
        
        newProducts.sort((a,b) => a.productType.localeCompare(b.productType));

        handleEditChange('products', newProducts);
    }
    
    const renderRow = (request: RefuelingRequest) => {
        const isEditing = editingRequestId === request.id;
        const vlsfoQty = request.products.find(p => p.productType === ProductType.VLSFO)?.quantity || 0;
        const mgoQty = request.products.find(p => p.productType === ProductType.MGO)?.quantity || 0;
        const locationName = locations.find(l => l.id === request.locationId)?.name || 'N/A';

        if (isEditing && editedRequest) {
             const editedVlsfoQty = editedRequest.products.find(p => p.productType === ProductType.VLSFO)?.quantity || 0;
             const editedMgoQty = editedRequest.products.find(p => p.productType === ProductType.MGO)?.quantity || 0;
            return (
                <tr key={request.id} className="bg-teal-900/30">
                    <td><input type="text" value={editedRequest.shipName} onChange={(e) => handleEditChange('shipName', e.target.value)} className="w-full bg-white/20 p-1 rounded border border-white/30" /></td>
                    <td>
                        <select value={editedRequest.locationId} onChange={(e) => handleEditChange('locationId', e.target.value)} className="w-full bg-white/20 p-1 rounded border border-white/30">
                             {serviceableLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </td>
                    <td><input type="number" value={editedVlsfoQty || ''} onChange={(e) => handleProductEditChange(ProductType.VLSFO, parseInt(e.target.value) || 0)} className="w-full bg-white/20 p-1 rounded border border-white/30" /></td>
                    <td><input type="number" value={editedMgoQty || ''} onChange={(e) => handleProductEditChange(ProductType.MGO, parseInt(e.target.value) || 0)} className="w-full bg-white/20 p-1 rounded border border-white/30" /></td>
                    <td><input type="datetime-local" value={editedRequest.windowStart} onChange={(e) => handleEditChange('windowStart', e.target.value)} className="w-full bg-white/20 p-1 rounded border border-white/30" /></td>
                    <td><input type="datetime-local" value={editedRequest.windowEnd} onChange={(e) => handleEditChange('windowEnd', e.target.value)} className="w-full bg-white/20 p-1 rounded border border-white/30" /></td>
                    <td><input type="date" value={editedRequest.contractualDate} onChange={(e) => handleEditChange('contractualDate', e.target.value)} className="w-full bg-white/20 p-1 rounded border border-white/30" /></td>
                    <td>
                        <select
                            value={editedRequest.status}
                            onChange={(e) => handleEditChange('status', e.target.value as RequestStatus)}
                            className="w-full bg-white/20 p-1 rounded border border-white/30 text-white"
                        >
                            <option value={RequestStatus.Confirmed}>{RequestStatus.Confirmed}</option>
                            <option value={RequestStatus.InProgress}>{RequestStatus.InProgress}</option>
                        </select>
                    </td>
                    <td className="flex items-center gap-2 p-1">
                        <button onClick={saveEditing} className="text-teal-400 hover:text-teal-300 p-1"><CheckIcon className="w-5 h-5"/></button>
                        <button onClick={cancelEditing} className="text-rose-400 hover:text-rose-300 p-1"><TrashIcon className="w-5 h-5"/></button>
                    </td>
                </tr>
            );
        }

        return (
            <tr key={request.id} className="hover:bg-white/5 transition-colors">
                <td className="font-semibold text-gray-200">{request.shipName}</td>
                <td>{locationName}</td>
                <td>{vlsfoQty > 0 ? `${vlsfoQty}t` : '-'}</td>
                <td>{mgoQty > 0 ? `${mgoQty}t` : '-'}</td>
                <td>{formatDateTime(request.windowStart)}</td>
                <td>{formatDateTime(request.windowEnd)}</td>
                <td>{formatDate(request.contractualDate)}</td>
                <td>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        request.status === RequestStatus.InProgress
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-teal-500/20 text-teal-300'
                    }`}>
                        {request.status}
                    </span>
                </td>
                <td className="flex items-center gap-2">
                    <button onClick={() => startEditing(request)} className="text-amber-400 hover:text-amber-300 p-1"><PencilIcon className="w-4 h-4"/></button>
                    <button onClick={() => removeRequest(request.id)} className="text-gray-500 hover:text-rose-400 p-1"><TrashIcon className="w-4 h-4"/></button>
                </td>
            </tr>
        );
    };

    return (
        <Card title="Pedidos de Abastecimento" icon={<ShipIcon className="w-7 h-7 text-amber-400" />}>
            <div className="overflow-auto h-full">
                <table ref={tableRef} className="w-full text-sm text-left text-gray-300" style={{tableLayout: 'fixed'}}>
                    <colgroup>
                        {requestTableHeaders.map(header => (
                            <col key={header.key} style={{width: `${colWidths[header.key]}px`}} />
                        ))}
                    </colgroup>
                    <thead className="text-xs text-amber-400 uppercase bg-black/20 sticky top-0 z-10">
                        <tr>
                            {requestTableHeaders.map((header, index) => (
                                <th key={header.key} className="px-4 py-3 select-none relative" style={{width: `${colWidths[header.key]}px`}}>
                                    {header.label}
                                    {index < requestTableHeaders.length - 1 && (
                                        <div
                                            onMouseDown={(e) => handleMouseDown(e, header.key)}
                                            className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
                                        />
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                        {requests.map(renderRow)}
                         <tr className="bg-black/20">
                            <td className="p-2"><input type="text" placeholder="Nome do Navio" value={newRequest.shipName} onChange={e => setNewRequest({...newRequest, shipName: e.target.value})} className="w-full bg-white/10 p-1 rounded border border-white/20" /></td>
                            <td className="p-2">
                                <select value={newRequest.locationId} onChange={e => setNewRequest({...newRequest, locationId: e.target.value})} className="w-full bg-white/10 p-1 rounded border border-white/20 disabled:opacity-50" disabled={serviceableLocations.length === 0}>
                                    {serviceableLocations.length === 0 ? <option>Adicione um local</option> : serviceableLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </td>
                            <td className="p-2"><input type="number" placeholder="0" value={newRequest.vlsfoQuantity || ''} onChange={e => setNewRequest({...newRequest, vlsfoQuantity: parseInt(e.target.value) || 0})} className="w-full bg-white/10 p-1 rounded border border-white/20" /></td>
                            <td className="p-2"><input type="number" placeholder="0" value={newRequest.mgoQuantity || ''} onChange={e => setNewRequest({...newRequest, mgoQuantity: parseInt(e.target.value) || 0})} className="w-full bg-white/10 p-1 rounded border border-white/20" /></td>
                            <td className="p-2"><input type="datetime-local" value={newRequest.windowStart} onChange={e => setNewRequest({...newRequest, windowStart: e.target.value})} className="w-full bg-white/10 p-1 rounded border border-white/20" /></td>
                            <td className="p-2"><input type="datetime-local" value={newRequest.windowEnd} onChange={e => setNewRequest({...newRequest, windowEnd: e.target.value})} className="w-full bg-white/10 p-1 rounded border border-white/20" /></td>
                            <td className="p-2"><input type="date" value={newRequest.contractualDate} onChange={e => setNewRequest({...newRequest, contractualDate: e.target.value})} className="w-full bg-white/10 p-1 rounded border border-white/20" /></td>
                            <td className="p-2">
                                <select 
                                    value={newRequest.status} 
                                    onChange={e => setNewRequest({...newRequest, status: e.target.value as RequestStatus})} 
                                    className="w-full bg-white/10 p-1 rounded border border-white/20"
                                >
                                    <option value={RequestStatus.Confirmed}>{RequestStatus.Confirmed}</option>
                                    <option value={RequestStatus.InProgress}>{RequestStatus.InProgress}</option>
                                </select>
                            </td>
                            <td className="p-2">
                                <form onSubmit={handleAddRequest}>
                                    <button type="submit" className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white p-2 rounded-md transition-colors"><PlusIcon className="w-5 h-5"/></button>
                                </form>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


// --- Schedule View Component ---
interface ScheduleViewProps {
  schedule: ScheduleItem[];
  isLoading: boolean;
  requests: RefuelingRequest[];
}

// FIX: Define a type for schedule column widths for type safety in resizing logic
type ScheduleColWidths = {
    shipName: number;
    locationName: number;
    product: number;
    quantity: number;
    bargeName: number;
    scheduledTime: number;
    windowStart: number;
    windowEnd: number;
    contractualDate: number;
};

const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule, isLoading, requests }) => {
    const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'table'>('list');

    const scheduleByBarge = useMemo(() => {
        if (viewMode !== 'kanban') return {};
        return schedule.reduce((acc, item) => {
            if (!acc[item.bargeName]) {
                acc[item.bargeName] = [];
            }
            acc[item.bargeName].push(item);
            return acc;
        }, {} as Record<string, ScheduleItem[]>);
    }, [schedule, viewMode]);
    
    const scheduleTableData = useMemo(() => {
        if (viewMode !== 'table') return [];
        
        return schedule
            .filter(item => item.shipName !== 'TERMINAL')
            .map(item => {
                const originalRequest = requests.find(r => r.shipName === item.shipName);
                return {
                    ...item,
                    windowStart: originalRequest?.windowStart || '',
                    windowEnd: originalRequest?.windowEnd || '',
                    contractualDate: originalRequest?.contractualDate || '',
                };
            });
    }, [schedule, requests, viewMode]);

    const [scheduleColWidths, setScheduleColWidths] = useState<ScheduleColWidths>({
        shipName: 180,
        locationName: 150,
        product: 100,
        quantity: 100,
        bargeName: 150,
        scheduledTime: 180,
        windowStart: 180,
        windowEnd: 180,
        contractualDate: 150,
    });
    const resizingScheduleColKey = useRef<keyof ScheduleColWidths | null>(null);
    const startScheduleX = useRef(0);
    const scheduleTableRef = useRef<HTMLTableElement>(null);
    
    const handleScheduleMouseDown = useCallback((e: React.MouseEvent, colKey: keyof ScheduleColWidths) => {
        resizingScheduleColKey.current = colKey;
        startScheduleX.current = e.clientX;

        const handleMouseMove = (event: MouseEvent) => {
             if (!resizingScheduleColKey.current) return;
             const currentX = event.clientX;
             const deltaX = currentX - startScheduleX.current;
             setScheduleColWidths(prevWidths => {
                 if (!resizingScheduleColKey.current) return prevWidths;
                 const newWidth = (prevWidths[resizingScheduleColKey.current] || 0) + deltaX;
                 return { ...prevWidths, [resizingScheduleColKey.current]: Math.max(newWidth, 50) };
             });
             startScheduleX.current = currentX;
        };
        const handleMouseUp = () => {
            resizingScheduleColKey.current = null;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, []);

    const scheduleTableHeaders = useMemo(() => [
        { key: 'shipName', label: 'Nome do Navio' },
        { key: 'locationName', label: 'Local' },
        { key: 'product', label: 'Produto' },
        { key: 'quantity', label: 'Quantidade' },
        { key: 'bargeName', label: 'Barcaça Designada' },
        { key: 'scheduledTime', label: 'Horário Agendado' },
        { key: 'windowStart', label: 'Início da Janela' },
        { key: 'windowEnd', label: 'Fim da Janela' },
        { key: 'contractualDate', label: 'Data Contratual' },
    ] as const, []);


    const renderScheduleItem = (item: ScheduleItem, index: number, view: 'list' | 'kanban') => {
        const baseClasses = "bg-white/5 p-4 rounded-lg animate-fade-in";
        const listClasses = "border-l-4"; 
        const kanbanClasses = "border-t-4";

        if (item.shipName === 'TERMINAL') {
              return (
                  <div key={`${item.scheduledTime}-${item.bargeName}-${index}`} className={`${baseClasses} ${view === 'list' ? `${listClasses} border-amber-500` : `${kanbanClasses} border-amber-500`}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg text-white flex items-center gap-2">
                            <TerminalIcon className="w-6 h-6 text-amber-400" />
                            Para o Terminal
                        </p>
                        <p className="text-sm text-gray-400">Barcaça: <span className="font-semibold text-gray-300">{item.bargeName}</span></p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                          <span className="text-xs font-semibold bg-amber-500/20 text-amber-300 px-2 py-1 rounded-full">Recarregar {item.product}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-amber-300">
                      <ClockIcon className="w-5 h-5"/>
                      <p className="text-sm font-medium">{formatDateTime(item.scheduledTime)}</p>
                    </div>
                  </div>
              );
          }
          return (
              <div key={`${item.scheduledTime}-${item.shipName}-${index}`} className={`${baseClasses} ${view === 'list' ? `${listClasses} border-teal-500` : `${kanbanClasses} border-teal-500`}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg text-white">{item.shipName}</p>
                    <p className="text-sm text-gray-400">Barcaça: <span className="font-semibold text-gray-300">{item.bargeName}</span></p>
                    <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5"><MapPinIcon className="w-4 h-4" /> {item.locationName}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-xs font-semibold bg-teal-500/20 text-teal-300 px-2 py-1 rounded-full">{item.quantity}t {item.product}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-teal-300">
                  <ClockIcon className="w-5 h-5"/>
                  <p className="text-sm font-medium">{formatDateTime(item.scheduledTime)}</p>
                </div>
              </div>
          );
    };

    return (
      <Card title="Programação Gerada" icon={<CalendarIcon className="w-7 h-7 text-amber-400" />}>
        <div className="h-full flex flex-col">
            <div className="flex-shrink-0 mb-4 flex justify-end gap-2">
                <button onClick={() => setViewMode('list')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'list' ? 'bg-gradient-to-r from-teal-500 to-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>Lista</button>
                <button onClick={() => setViewMode('kanban')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-gradient-to-r from-teal-500 to-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>Por Barcaça</button>
                <button onClick={() => setViewMode('table')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'table' ? 'bg-gradient-to-r from-teal-500 to-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}>Tabela</button>
            </div>
            
            <div className="flex-grow overflow-auto pr-1">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center text-center p-8 h-full">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400"></div>
                        <p className="text-gray-300 mt-4">A IA está gerando a programação otimizada...</p>
                    </div>
                )}
                {!isLoading && schedule.length === 0 && (
                    <div className="text-center text-gray-400 p-8 h-full flex flex-col justify-center items-center">
                        <p>A programação aparecerá aqui após ser gerada.</p>
                        <p className="text-sm mt-2">Adicione barcaças e pedidos, depois clique em "Gerar Programação".</p>
                    </div>
                )}
                {!isLoading && schedule.length > 0 && (
                    viewMode === 'list' ? (
                        <div className="space-y-4 pr-1">
                            {schedule.map((item, index) => renderScheduleItem(item, index, 'list'))}
                        </div>
                    ) : viewMode === 'kanban' ? (
                        <div className="flex gap-6 pb-4">
                            {Object.entries(scheduleByBarge).map(([bargeName, items]: [string, ScheduleItem[]]) => (
                                <div key={bargeName} className="flex-shrink-0 w-80 bg-black/20 rounded-xl p-4">
                                    <h3 className="font-bold text-lg text-amber-400 mb-4 pb-2 border-b border-white/10">{bargeName}</h3>
                                    <div className="space-y-4">
                                        {items.map((item, index) => renderScheduleItem(item, index, 'kanban'))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                         <div className="overflow-auto h-full">
                            <table ref={scheduleTableRef} className="w-full text-sm text-left text-gray-300" style={{tableLayout: 'fixed'}}>
                                <colgroup>
                                    {scheduleTableHeaders.map(header => (
                                        <col key={header.key} style={{width: `${scheduleColWidths[header.key]}px`}} />
                                    ))}
                                </colgroup>
                                <thead className="text-xs text-amber-400 uppercase bg-black/20 sticky top-0 z-10">
                                    <tr>
                                       {scheduleTableHeaders.map((header, index) => (
                                            <th key={header.key} className="px-4 py-3 select-none relative" style={{width: `${scheduleColWidths[header.key]}px`}}>
                                                {header.label}
                                                {index < scheduleTableHeaders.length - 1 && (
                                                    <div
                                                        onMouseDown={(e) => handleScheduleMouseDown(e, header.key)}
                                                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
                                                    />
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {scheduleTableData.map((item, index) => (
                                        <tr key={index} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-2 font-semibold text-gray-200">{item.shipName}</td>
                                            <td className="px-4 py-2">{item.locationName}</td>
                                            <td className="px-4 py-2">{item.product}</td>
                                            <td className="px-4 py-2">{item.quantity}t</td>
                                            <td className="px-4 py-2 text-teal-300">{item.bargeName}</td>
                                            <td className="px-4 py-2 text-teal-300">{formatDateTime(item.scheduledTime)}</td>
                                            <td className="px-4 py-2">{formatDateTime(item.windowStart)}</td>
                                            <td className="px-4 py-2">{formatDateTime(item.windowEnd)}</td>
                                            <td className="px-4 py-2">{formatDate(item.contractualDate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>
        </div>
      </Card>
    );
};

// --- Operations History Component ---
interface OperationsHistoryProps {
    history: OperationHistoryItem[];
}
const OperationsHistory: React.FC<OperationsHistoryProps> = ({ history }) => {
    const groupedHistory = useMemo(() => {
        return history.reduce((acc, item) => {
            if (!acc[item.shipName]) {
                acc[item.shipName] = [];
            }
            acc[item.shipName].push(item);
            return acc;
        }, {} as Record<string, OperationHistoryItem[]>);
    }, [history]);

    return (
        <Card title="Histórico de Operações" icon={<HistoryIcon className="w-7 h-7 text-amber-400" />}>
            <div className="space-y-6 overflow-y-auto pr-2 h-full">
                {history.length === 0 && (
                    <div className="text-center text-gray-400 p-8">
                        <p>Nenhuma operação foi registrada ainda.</p>
                        <p className="text-sm mt-2">Gere uma programação e confirme-a para ver o histórico aqui.</p>
                    </div>
                )}
                {Object.entries(groupedHistory).map(([shipName, items]: [string, OperationHistoryItem[]]) => (
                    <div key={shipName}>
                        <h3 className="text-lg font-bold text-gray-200 mb-2 border-b-2 border-white/10 pb-1 flex items-center gap-2">
                           <ShipIcon className="w-5 h-5" /> {shipName}
                        </h3>
                        <div className="space-y-3">
                            {items.map(item => (
                                <div key={item.id} className="bg-white/5 p-3 rounded-md text-sm">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-gray-300">
                                                <span className="font-semibold text-teal-400">{item.quantity}t {item.product}</span> via {item.bargeName}
                                            </p>
                                        </div>
                                        <p className="text-xs text-gray-400">{formatDateTime(item.completionTime)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

// --- Priorities Setup Component ---
interface PrioritiesSetupProps {
    priorities: Priority[];
    setPriorities: React.Dispatch<React.SetStateAction<Priority[]>>;
    resetPriorities: () => void;
}
const PrioritiesSetup: React.FC<PrioritiesSetupProps> = ({ priorities, setPriorities, resetPriorities }) => {
    const [newPriorityText, setNewPriorityText] = useState('');
    const draggedItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleAddPriority = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPriorityText.trim()) {
            setPriorities(prev => [...prev, { id: crypto.randomUUID(), text: newPriorityText.trim() }]);
            setNewPriorityText('');
        }
    };

    const handleDeletePriority = (id: string) => {
        setPriorities(prev => prev.filter(p => p.id !== id));
    };
    
    const handleDragEnd = () => {
        if (draggedItem.current === null || dragOverItem.current === null) return;
        
        const newPriorities = [...priorities];
        const draggedItemContent = newPriorities.splice(draggedItem.current, 1)[0];
        newPriorities.splice(dragOverItem.current, 0, draggedItemContent);
        
        draggedItem.current = null;
        dragOverItem.current = null;
        
        setPriorities(newPriorities);
    };

    return (
        <Card title="Prioridades de Agendamento" icon={<CalendarIcon className="w-7 h-7 text-amber-400" />}>
            <div className="h-full flex flex-col">
                <p className="text-sm text-gray-400 mb-4">Arraste e solte para reordenar as prioridades. A IA seguirá esta ordem ao criar a programação.</p>
                <form onSubmit={handleAddPriority} className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={newPriorityText}
                        onChange={(e) => setNewPriorityText(e.target.value)}
                        placeholder="Adicionar nova regra de prioridade"
                        className="flex-grow bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <button type="submit" className="bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-bold p-2 rounded-md transition-colors"><PlusIcon className="w-5 h-5"/></button>
                </form>

                <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                    {priorities.map((p, index) => (
                        <div
                            key={p.id}
                            draggable
                            onDragStart={() => (draggedItem.current = index)}
                            onDragEnter={() => (dragOverItem.current = index)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            className="flex items-center gap-2 bg-white/5 p-3 rounded-lg cursor-grab active:cursor-grabbing"
                        >
                            <GripVerticalIcon className="w-5 h-5 text-gray-500" />
                            <p className="flex-grow text-gray-300 text-sm">{p.text}</p>
                            <button onClick={() => handleDeletePriority(p.id)} className="text-gray-500 hover:text-rose-400 p-1"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                    ))}
                </div>
                <button
                  onClick={resetPriorities}
                  className="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                >
                    Redefinir para Padrões
                </button>
            </div>
        </Card>
    );
};


// --- Location Setup Component ---
interface LocationSetupProps {
    locations: Location[];
    setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
}
const LocationSetup: React.FC<LocationSetupProps> = ({ locations, setLocations }) => {
    const initialFormState = { id: '', name: '', latitude: 0, longitude: 0 };
    const [locationForm, setLocationForm] = useState(initialFormState);
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

    const handleFormChange = (field: keyof typeof locationForm, value: string | number) => {
        setLocationForm(prev => ({ ...prev, [field]: value }));
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (locationForm.name.trim()) {
            if (editingLocationId) {
                // Update existing location
                setLocations(prev => prev.map(l => l.id === editingLocationId ? { ...l, ...locationForm } : l));
            } else {
                // Add new location
                setLocations(prev => [...prev, { ...locationForm, id: crypto.randomUUID() }]);
            }
            setEditingLocationId(null);
            setLocationForm(initialFormState);
        }
    };
    
    const startEditing = (location: Location) => {
        setEditingLocationId(location.id);
        setLocationForm({ id: location.id, name: location.name, latitude: location.latitude, longitude: location.longitude });
    };
    
    const cancelEditing = () => {
        setEditingLocationId(null);
        setLocationForm(initialFormState);
    };

    const handleDeleteLocation = (id: string) => {
        const locationToDelete = locations.find(l => l.id === id);
        if (locationToDelete?.name === 'TERMINAL') {
            alert("A localidade 'TERMINAL' é essencial para a lógica da IA e não pode ser excluída.");
            return;
        }
        setLocations(prev => prev.filter(l => l.id !== id));
    };

    return (
        <Card title="Locais de Abastecimento" icon={<MapPinIcon className="w-7 h-7 text-amber-400" />}>
            <div className="h-full flex flex-col">
                <p className="text-sm text-gray-400 mb-4">Defina os locais possíveis onde os navios podem ser abastecidos.</p>
                <form onSubmit={handleFormSubmit} className="space-y-3 mb-6 p-4 bg-white/5 rounded-lg">
                    <input
                        type="text"
                        value={locationForm.name}
                        onChange={(e) => handleFormChange('name', e.target.value)}
                        placeholder="Nome do Local (ex: Píer 7)"
                        className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:bg-gray-600"
                        disabled={editingLocationId ? locations.find(l => l.id === editingLocationId)?.name === 'TERMINAL' : false}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <input
                            type="number"
                            step="any"
                            value={locationForm.latitude || ''}
                            onChange={(e) => handleFormChange('latitude', parseFloat(e.target.value) || 0)}
                            placeholder="Latitude"
                            className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                         <input
                            type="number"
                            step="any"
                            value={locationForm.longitude || ''}
                            onChange={(e) => handleFormChange('longitude', parseFloat(e.target.value) || 0)}
                            placeholder="Longitude"
                            className="w-full bg-white/10 text-white placeholder-gray-400 p-2 rounded-md border border-white/20 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="flex-grow bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white font-bold p-2 rounded-md transition-colors flex items-center justify-center gap-2">
                            {editingLocationId ? <CheckIcon className="w-5 h-5"/> : <PlusIcon className="w-5 h-5"/>}
                            {editingLocationId ? 'Salvar Alterações' : 'Adicionar Local'}
                        </button>
                        {editingLocationId && (
                             <button type="button" onClick={cancelEditing} className="bg-gray-700 hover:bg-gray-600 text-white font-bold p-2 rounded-md transition-colors">Cancelar</button>
                        )}
                    </div>
                </form>

                <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                    {locations.map((location) => (
                        <div key={location.id} className="flex items-center justify-between bg-white/5 p-3 rounded-lg text-sm">
                            <div className="flex items-center gap-2">
                                <p className="text-gray-200 font-semibold">{location.name}</p>
                                {location.name === 'TERMINAL' && (
                                    <div className="relative group">
                                        <InfoIcon className="w-4 h-4 text-amber-400 cursor-help" />
                                        <div className="absolute top-full left-0 mt-2 w-max max-w-xs p-2 text-xs text-white bg-gray-800 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                                            Para a localidade TERMINAL, indicar as coordenadas do Píer de Barcaças.
                                        </div>
                                    </div>
                                )}
                            </div>
                           
                            <div>
                                <p className="text-gray-400 text-xs text-right">Lat: {location.latitude.toFixed(4)}</p>
                                <p className="text-gray-400 text-xs text-right">Lon: {location.longitude.toFixed(4)}</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button onClick={() => startEditing(location)} className="text-amber-500 hover:text-amber-400 p-1"><PencilIcon className="w-4 h-4"/></button>
                                {location.name !== 'TERMINAL' && (
                                     <button onClick={() => handleDeleteLocation(location.id)} className="text-gray-500 hover:text-rose-400 p-1"><TrashIcon className="w-4 h-4" /></button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
};

// --- Map View Component ---
interface MapViewProps {
    barges: Barge[];
    bargeStates: BargeState[];
    locations: Location[];
    schedule: ScheduleItem[];
}

const MapView: React.FC<MapViewProps> = ({ barges, bargeStates, locations, schedule }) => {
    // This key is now read from environment variables for security.
    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    const [selectedBargeId, setSelectedBargeId] = useState<string | null>(null);

    const googleMapsUrl = useMemo(() => {
        if (!GOOGLE_MAPS_API_KEY) {
            return "about:blank";
        }
        const baseUrl = 'https://www.google.com/maps/embed/v1/';
        
        // Find barges that actually have a schedule
        const scheduledBargeNames = new Set(schedule.map(item => item.bargeName));

        if (selectedBargeId && scheduledBargeNames.size > 0) {
            const selectedBarge = barges.find(b => b.id === selectedBargeId);
            if (!selectedBarge) {
                setSelectedBargeId(null);
                return ''; // barge not found, reset
            }

            const bargeSchedule = schedule.filter(item => item.bargeName === selectedBarge.name);
            const initialState = bargeStates.find(bs => bs.bargeId === selectedBarge.id);
            const startLocation = locations.find(l => l.id === initialState?.locationId);

            if (bargeSchedule.length > 0 && startLocation) {
                const waypoints = bargeSchedule.map(item => {
                    const loc = locations.find(l => l.name === item.locationName);
                    return loc ? `${loc.latitude},${loc.longitude}` : '';
                }).filter(Boolean);
                
                if (waypoints.length > 0) {
                    const origin = `${startLocation.latitude},${startLocation.longitude}`;
                    const destination = waypoints[waypoints.length - 1];
                    const waypointsString = waypoints.slice(0, -1).join('|');

                    return `${baseUrl}directions?key=${GOOGLE_MAPS_API_KEY}&origin=${origin}&destination=${destination}&waypoints=${waypointsString}&maptype=satellite`;
                }
            }
        }
        
        // Default view: center on all locations
        if (locations.length > 0) {
            const avgLat = locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length;
            const avgLng = locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length;
            return `${baseUrl}view?key=${GOOGLE_MAPS_API_KEY}&center=${avgLat},${avgLng}&zoom=12&maptype=satellite`;
        }

        return `${baseUrl}view?key=${GOOGLE_MAPS_API_KEY}&center=33.75,-118.25&zoom=12&maptype=satellite`;

    }, [selectedBargeId, schedule, locations, barges, bargeStates, GOOGLE_MAPS_API_KEY]);


    if (locations.length === 0) {
      return (
        <Card title="Visualização no Mapa" icon={<MapIcon className="w-7 h-7 text-amber-400" />}>
           <div className="flex items-center justify-center h-full text-gray-400">
             <p>Adicione locais para ver a visualização no mapa.</p>
           </div>
        </Card>
      );
    }
    
    if (!GOOGLE_MAPS_API_KEY) {
      return (
        <Card title="Visualização no Mapa" icon={<MapIcon className="w-7 h-7 text-amber-400" />}>
           <div className="flex items-center justify-center h-full text-center text-amber-300 p-4">
             <p>Para habilitar o mapa, adicione a variável de ambiente `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` nas configurações de deploy do seu projeto (ex: Vercel).</p>
           </div>
        </Card>
      )
    }
    
    const scheduledBarges = barges.filter(barge => schedule.some(item => item.bargeName === barge.name));

    return (
        <Card title="Visualização no Mapa" icon={<MapIcon className="w-7 h-7 text-amber-400" />}>
          <div className="flex flex-col w-full h-full bg-black/20 rounded-lg overflow-hidden">
            <div className="p-2 bg-black/30 flex-shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold mr-2">Mostrar Rota para:</p>
                    <button 
                        onClick={() => setSelectedBargeId(null)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${!selectedBargeId ? 'bg-gradient-to-r from-teal-500 to-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                    >
                        Mostrar Todos os Locais
                    </button>
                    {scheduledBarges.map(barge => (
                         <button 
                            key={barge.id}
                            onClick={() => setSelectedBargeId(barge.id)}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${selectedBargeId === barge.id ? 'bg-gradient-to-r from-teal-500 to-amber-500 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-300'}`}
                        >
                            {barge.name}
                        </button>
                    ))}
                    {scheduledBarges.length === 0 && schedule.length > 0 && <span className="text-xs text-gray-400">Nenhuma rota de barcaça na programação atual.</span>}
                </div>
            </div>
            <div className="flex-grow w-full h-full">
                <iframe
                    className="w-full h-full"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    src={googleMapsUrl}>
                </iframe>
            </div>
          </div>
        </Card>
    );
};


// --- Tab Button Component ---
interface TabButtonProps {
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}
const TabButton: React.FC<TabButtonProps> = ({ isActive, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-base font-semibold rounded-t-lg transition-colors duration-300 focus:outline-none ${
            isActive
                ? 'bg-black/10 border-b-2 border-amber-500 text-amber-400'
                : 'text-gray-300 hover:text-white'
        }`}
    >
        {children}
    </button>
);

// --- Logo Component ---
const ProgbunkerLogo = () => (
  <svg 
    height="60" 
    viewBox="0 0 420 60" 
    xmlns="http://www.w3.org/2000/svg"
    className="mx-auto"
    aria-label="PROGbunker"
  >
    <defs>
      <linearGradient id="logoGradient" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#14b8a6" />
        <stop offset="50%" stopColor="#fcd34d" />
        <stop offset="100%" stopColor="#fbbf24" />
      </linearGradient>
    </defs>
    
    <path 
      d="M30 0 C15 0, 5 12, 5 25 C5 45, 30 58, 30 58 S 55 45, 55 25 C55 12, 45 0, 30 0 Z M30 10 C38.28 10, 45 16.72, 45 25 C45 30, 40 38, 30 45 C20 38, 15 30, 15 25 C15 16.72, 21.72 10, 30 10 Z"
      fill="url(#logoGradient)" 
    />
    
    <text 
      x="75" 
      y="48" 
      fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" 
      fontSize="50" 
      fontWeight="800"
      letterSpacing="-2"
      fill="url(#logoGradient)"
    >
      PROG<tspan fontWeight="500" letterSpacing="0">bunker</tspan>
    </text>
  </svg>
);


// --- Main App Component ---
type TabName = 'setup' | 'state' | 'scheduling' | 'pedidos' | 'history' | 'priorities' | 'locations' | 'map';

const defaultPriorities: Priority[] = [
  { id: 'p1', text: "Data Contratual: Priorizar o atendimento de navios em sua 'dataContratual'." },
  { id: 'p2', text: "Urgência: Em seguida, priorizar navios com o horário de 'fim da janela' mais cedo." },
  { id: 'p3', text: 'Quantidade: Depois, priorizar navios com a maior quantidade total solicitada.' },
  { id: 'p4', text: 'Agendar quaisquer solicitações restantes após as acima serem atendidas.' },
];

const defaultBarges: Barge[] = [
    { id: 'b1', name: 'Poseidon', products: [{ productType: ProductType.VLSFO, capacity: 2000 }], speed: 10 },
    { id: 'b2', name: 'Triton', products: [{ productType: ProductType.MGO, capacity: 800 }], speed: 12 },
    { id: 'b3', name: 'Nereus (Híbrida)', products: [{ productType: ProductType.VLSFO, capacity: 1000 }, { productType: ProductType.MGO, capacity: 400 }], speed: 9 },
];

const defaultLocations: Location[] = [
    // The AI uses TERMINAL for recharges. It is the only default location.
    { id: 'loc-term', name: 'TERMINAL', latitude: -23.918613, longitude: -46.367846 },
];

const defaultBargeStates: BargeState[] = [
    { bargeId: 'b1', volumes: [{productType: ProductType.VLSFO, volume: 1500}], locationId: 'loc-term' },
    { bargeId: 'b2', volumes: [{productType: ProductType.MGO, volume: 600}], locationId: 'loc-term' },
    { bargeId: 'b3', volumes: [{productType: ProductType.VLSFO, volume: 750}, {productType: ProductType.MGO, volume: 300}], locationId: 'loc-term' },
];

const defaultRequests: RefuelingRequest[] = []; // Start with no requests, as locations must be configured first.

// Type definition for the application state to be saved
interface AppState {
    barges: Barge[];
    bargeStates: BargeState[];
    requests: RefuelingRequest[];
    locations: Location[];
    priorities: Priority[];
    operationHistory: OperationHistoryItem[];
    simulationStartTime?: string;
    tabOrder?: TabName[];
}

const LOCAL_STORAGE_KEY = 'bargeSchedulerConfig_v3'; // Incremented version to avoid conflicts
const initialTabOrder: TabName[] = ['scheduling', 'pedidos', 'state', 'setup', 'locations', 'map', 'priorities', 'history'];

// Function to load the application state from localStorage
const loadInitialState = (): AppState | null => {
    try {
        const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedStateJSON) {
            const state = JSON.parse(savedStateJSON) as AppState;
            // Provide default tabOrder if not present or mismatched
            if (!state.tabOrder || state.tabOrder.length !== initialTabOrder.length) {
                state.tabOrder = initialTabOrder;
            }
            return state;
        }
    } catch (error) {
        console.error("Could not load state from localStorage on init", error);
        localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
    }
    return null; // Return null if nothing is found or there's an error
};

export default function App() {
  const [initialState] = useState(loadInitialState);
  const isInitialMount = useRef(true);

  const [barges, setBarges] = useState<Barge[]>(initialState?.barges || defaultBarges);
  const [locations, setLocations] = useState<Location[]>(initialState?.locations || defaultLocations);
  const [bargeStates, setBargeStates] = useState<BargeState[]>(initialState?.bargeStates || defaultBargeStates);
  const [requests, setRequests] = useState<RefuelingRequest[]>(initialState?.requests || defaultRequests);
  const [operationHistory, setOperationHistory] = useState<OperationHistoryItem[]>(initialState?.operationHistory || []);
  const [priorities, setPriorities] = useState<Priority[]>(initialState?.priorities || defaultPriorities);
  const [tabOrder, setTabOrder] = useState<TabName[]>(initialState?.tabOrder || initialTabOrder);
  const [simulationStartTime, setSimulationStartTime] = useState<string>(initialState?.simulationStartTime || (() => {
    const now = new Date();
    // Adjust for timezone offset to show local time in the input
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  })());
  
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>(tabOrder[0] || 'setup');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const draggedTab = useRef<TabName | null>(null);
  const dragOverTab = useRef<TabName | null>(null);
  
  // Auto-save state to localStorage on any change
  useEffect(() => {
    // Skip saving on the initial render to avoid overwriting state before it's fully loaded
    if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
    }
    try {
        const appState: AppState = {
            barges,
            bargeStates,
            requests,
            locations,
            priorities,
            operationHistory,
            simulationStartTime,
            tabOrder,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(appState));
    } catch (err) {
        console.error("Failed to auto-save state to localStorage", err);
        setError("Erro: Não foi possível salvar a configuração automaticamente. Suas alterações podem não ser mantidas.");
    }
  }, [barges, bargeStates, requests, locations, priorities, operationHistory, simulationStartTime, tabOrder]);


  const bargesForPrompt = useMemo((): BargeForPrompt[] => {
    const defaultLocation: Location = { id: 'default', name: 'Terminal Padrão', latitude: 0, longitude: 0 };
    return barges.map(barge => {
        const state = bargeStates.find(s => s.bargeId === barge.id);
        const initialLocation = locations.find(l => l.id === state?.locationId) || locations[0] || defaultLocation;

        const productsForPrompt = barge.products.map(p => {
            const volumeState = state?.volumes.find(v => v.productType === p.productType);
            return {
                productType: p.productType,
                capacity: p.capacity,
                currentVolume: volumeState?.volume || 0
            }
        });

        return {
            id: barge.id,
            name: barge.name,
            initialLocation: initialLocation,
            speed: barge.speed,
            products: productsForPrompt
        };
    });
  }, [barges, bargeStates, locations]);

  const requestsToSchedule = useMemo(() => requests.filter(r => r.status === RequestStatus.Confirmed), [requests]);

  const handleGenerateSchedule = useCallback(async () => {
    if (bargesForPrompt.length === 0 || requestsToSchedule.length === 0) {
      setError("Adicione pelo menos uma barcaça e um pedido com o status 'A Confirmar'.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSchedule([]);
    try {
      const requestsForPrompt: RequestForPrompt[] = requestsToSchedule.map(r => {
          const location = locations.find(l => l.id === r.locationId);
          return {
              shipName: r.shipName,
              products: r.products,
              windowStart: r.windowStart,
              windowEnd: r.windowEnd,
              contractualDate: r.contractualDate,
              location: location || { id: 'unknown', name: 'Local Desconhecido', latitude: 0, longitude: 0 }
          }
      });

      const result = await generateSchedule(bargesForPrompt, requestsForPrompt, priorities, simulationStartTime);
      const sortedResult = result.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
      setSchedule(sortedResult);
    } catch (err: any) {
      setError(err.message || "Ocorreu um erro desconhecido.");
    } finally {
      setIsLoading(false);
    }
  }, [bargesForPrompt, requestsToSchedule, priorities, locations, simulationStartTime]);

  const handleCommitSchedule = useCallback(() => {
    if (schedule.length === 0) return;

    const newHistoryItems: OperationHistoryItem[] = schedule
      .filter(item => item.shipName !== 'TERMINAL')
      .map(item => ({
        ...item,
        id: crypto.randomUUID(),
        completionTime: item.scheduledTime,
    }));

    setOperationHistory(prev => [...prev, ...newHistoryItems].sort((a, b) => new Date(b.completionTime).getTime() - new Date(a.completionTime).getTime()));
    
    setBargeStates(currentStates => {
      const nextStates = JSON.parse(JSON.stringify(currentStates));

      schedule.forEach(item => {
        const barge = barges.find(b => b.name === item.bargeName);
        if (!barge) return;

        const stateToUpdate = nextStates.find(s => s.bargeId === barge.id);
        if (!stateToUpdate) return;
        
        // Update volume
        if (item.shipName === 'TERMINAL') {
          const productToReload = stateToUpdate.volumes.find(v => v.productType === item.product);
          const bargeProductInfo = barge.products.find(p => p.productType === item.product);
          if (productToReload && bargeProductInfo) {
            productToReload.volume = bargeProductInfo.capacity;
          }
        } else {
          const productToUpdate = stateToUpdate.volumes.find(v => v.productType === item.product);
          if (productToUpdate) {
            productToUpdate.volume = Math.max(0, productToUpdate.volume - item.quantity);
          }
        }

        // Update location
        const newLocation = locations.find(l => l.name === item.locationName);
        if (newLocation) {
          stateToUpdate.locationId = newLocation.id;
        }
      });
      return nextStates;
    });

    setSchedule([]); // Clear the schedule after committing
  }, [schedule, barges, locations]);

  const handleResetToDefaults = useCallback(() => {
    if (window.confirm("Tem certeza de que deseja redefinir todos os dados para os padrões da aplicação? Todas as suas alterações personalizadas serão perdidas.")) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        setBarges(defaultBarges);
        setBargeStates(defaultBargeStates);
        setRequests(defaultRequests);
        setLocations(defaultLocations);
        setPriorities(defaultPriorities);
        setOperationHistory([]);
        setTabOrder(initialTabOrder);
        setSimulationStartTime(() => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            return now.toISOString().slice(0, 16);
        });
        setSchedule([]);
        setError(null);
        setFeedbackMessage("A aplicação foi redefinida para os padrões.");
        setTimeout(() => setFeedbackMessage(''), 3000);
    }
  }, []);

  const handleTabDragEnd = () => {
    if (draggedTab.current && dragOverTab.current && draggedTab.current !== dragOverTab.current) {
        const currentTabOrder = [...tabOrder];
        const draggedIndex = currentTabOrder.indexOf(draggedTab.current);
        const targetIndex = currentTabOrder.indexOf(dragOverTab.current);

        const [draggedItem] = currentTabOrder.splice(draggedIndex, 1);
        currentTabOrder.splice(targetIndex, 0, draggedItem);
        setTabOrder(currentTabOrder);
    }
    draggedTab.current = null;
    dragOverTab.current = null;
  };

  const tabLabels: Record<TabName, string> = {
    setup: 'Frota',
    state: 'Cenário inicial',
    locations: 'Locais',
    scheduling: 'Programação',
    pedidos: 'Pedidos',
    map: 'Mapa',
    priorities: 'Prioridades',
    history: 'Histórico'
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'setup':
        return <BargeSetup barges={barges} setBarges={setBarges} setBargeStates={setBargeStates} locations={locations} />;
      case 'state':
        return <BargeInitialState barges={barges} bargeStates={bargeStates} setBargeStates={setBargeStates} locations={locations} simulationStartTime={simulationStartTime} setSimulationStartTime={setSimulationStartTime} />;
      case 'locations':
        return <LocationSetup locations={locations} setLocations={setLocations} />;
      case 'scheduling':
        return <ScheduleView schedule={schedule} isLoading={isLoading} requests={requests} />;
      case 'pedidos':
        return <RequestsTable requests={requests} setRequests={setRequests} locations={locations} />;
      case 'map':
        return <MapView barges={barges} bargeStates={bargeStates} locations={locations} schedule={schedule} />;
      case 'history':
         return <OperationsHistory history={operationHistory} />;
      case 'priorities':
        return <PrioritiesSetup priorities={priorities} setPriorities={setPriorities} resetPriorities={() => setPriorities(defaultPriorities)} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-800 via-teal-950 to-black text-white font-sans p-4 sm:p-6 lg:p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-grow">
        <header className="text-center mb-6 flex-shrink-0">
          <ProgbunkerLogo />
          <p className="mt-2 text-white/80">Otimize as operações de reabastecimento de navios com o poder do Gemini.</p>
        </header>

        <div className="border-b border-white/10 mb-6">
            <div className="flex space-x-2 flex-wrap">
                {tabOrder.map(tabKey => (
                     <div
                        key={tabKey}
                        draggable
                        onDragStart={() => (draggedTab.current = tabKey)}
                        onDragEnter={() => (dragOverTab.current = tabKey)}
                        onDragEnd={handleTabDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className="cursor-move"
                    >
                        <TabButton isActive={activeTab === tabKey} onClick={() => setActiveTab(tabKey)}>
                            {tabLabels[tabKey]}
                        </TabButton>
                    </div>
                ))}
            </div>
        </div>

        <main className="flex-grow min-h-[500px]">
            {renderTabContent()}
        </main>
        
        <footer className="mt-8 text-center space-y-4 flex-shrink-0">
            {error && <p className="text-rose-400 bg-rose-900/50 p-3 rounded-md">{error}</p>}
            <div className="flex justify-center items-center gap-4">
              <button
                  onClick={handleGenerateSchedule}
                  disabled={isLoading || barges.length === 0 || requestsToSchedule.length === 0}
                  className="bg-gradient-to-r from-teal-500 to-amber-500 hover:from-teal-600 hover:to-amber-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                  {isLoading ? 'Gerando...' : 'Gerar Programação'}
              </button>
              <button
                  onClick={handleCommitSchedule}
                  disabled={isLoading || schedule.length === 0}
                  className="bg-amber-700 hover:bg-amber-600 text-white font-bold py-3 px-8 rounded-full shadow-lg transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                  Confirmar no Histórico
              </button>
            </div>
            <div className="flex justify-center items-center gap-4 mt-4 pt-4 border-t border-white/10">
                <p className="text-sm text-gray-400">
                    Sua configuração é salva automaticamente.
                </p>
                <button 
                  onClick={handleResetToDefaults} 
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2 px-4 rounded-md transition-colors text-sm"
                >
                    <TrashIcon className="w-4 h-4"/> Redefinir para Padrões
                </button>
            </div>
            <div className="h-4">
             {feedbackMessage && <p className="text-sm text-teal-400">{feedbackMessage}</p>}
            </div>
        </footer>
      </div>
    </div>
  );
}
