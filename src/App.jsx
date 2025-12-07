// src/App.jsx
import { useState, useEffect } from 'react'
import './App.css'
import { db } from './firebase'
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore'
import * as XLSX from 'xlsx'

function App() {
  const [materials, setMaterials] = useState([]);
  
  // 메인 화면 탭 상태
  const [currentSheet, setCurrentSheet] = useState('전기');
  const [currentMajor, setCurrentMajor] = useState('전체');
  const [currentMinor, setCurrentMinor] = useState('전체');
  
  // 현황판 내부 탭 상태 [신규]
  const [statusTab, setStatusTab] = useState('전체'); // '전체', '전기', '자동화'

  const [searchTerm, setSearchTerm] = useState('');
  
  const [newItem, setNewItem] = useState({
    type: '전기', major: '', minor: '', code: '', name: '', price: '', icon: ''
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  // DB 실시간 연동
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "materials"), (snapshot) => {
      const newMaterials = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      newMaterials.sort((a, b) => a.name.localeCompare(b.name));
      setMaterials(newMaterials);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setCurrentMinor('전체');
  }, [currentMajor, currentSheet]);

  const handleCount = async (id, currentCount, delta) => {
    if (currentCount + delta < 0) return;
    const materialRef = doc(db, "materials", id);
    await updateDoc(materialRef, { count: currentCount + delta });
  };

  const handleAdd = async () => {
    if (!newItem.major || !newItem.name) return alert("대분류와 품명을 입력해주세요!");
    
    const iconValue = newItem.icon.trim() === '' ? '📦' : newItem.icon;
    const priceValue = newItem.price ? parseInt(newItem.price) : 0;

    await addDoc(collection(db, "materials"), {
      type: newItem.type,
      major: newItem.major,
      minor: newItem.minor,
      code: newItem.code,
      name: newItem.name,
      price: priceValue,
      icon: iconValue,
      count: 0
    });

    alert(`'${newItem.name}' 등록 완료!`);
    setNewItem({ ...newItem, name: '', code: '', price: '' }); 
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`정말 '${name}'을(를) 삭제하시겠습니까?`)) {
      await deleteDoc(doc(db, "materials", id));
    }
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheets = ['전기', '자동화'];

    sheets.forEach(sheetName => {
      const data = materials.filter(m => m.type === sheetName).map(item => ({
        '대분류': item.major,
        '소분류': item.minor,
        '품목코드': item.code,
        '품명': item.name,
        '단가': item.price,
        '현재고': item.count,
        '재고금액': (item.price || 0) * item.count
      }));
      if(data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    const date = new Date().toISOString().slice(0,10).replace(/-/g,"");
    XLSX.writeFile(wb, `자재현황_${date}.xlsx`);
  };

  // --- 데이터 가공 ---
  const sheetMaterials = materials.filter(item => item.type === currentSheet);
  const majorCategories = ['전체', ...new Set(sheetMaterials.map(m => m.major))];
  const minorCategories = currentMajor === '전체' 
    ? [] 
    : ['전체', ...new Set(sheetMaterials.filter(m => m.major === currentMajor).map(m => m.minor).filter(Boolean))]; 

  const filteredMaterials = sheetMaterials.filter(item => {
    const majorMatch = currentMajor === '전체' || item.major === currentMajor;
    const minorMatch = currentMinor === '전체' || item.minor === currentMinor;
    const searchMatch = 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (item.code && item.code.toLowerCase().includes(searchTerm.toLowerCase()));
    return majorMatch && minorMatch && searchMatch;
  });

  const formatMoney = (num) => (num || 0).toLocaleString();

  // 자동완성용 목록
  const existingMajors = [...new Set(materials.filter(m => m.type === newItem.type).map(m => m.major))];
  const existingMinors = [...new Set(materials.filter(m => m.type === newItem.type && m.major === newItem.major).map(m => m.minor))];

  // [신규] 현황판용 데이터 필터링 & 합계 계산
  const getStatusData = () => {
    let data = materials;
    if (statusTab !== '전체') {
      data = materials.filter(item => item.type === statusTab);
    }
    return data;
  };

  const statusData = getStatusData();
  const totalStatusValue = statusData.reduce((sum, item) => sum + ((item.price || 0) * item.count), 0);

  // 샘플 데이터
  const initSampleData = async () => {
    if(!confirm("샘플 데이터를 추가할까요?")) return;
    const samples = [
      { type: '전기', major: '차단기', minor: '배선용(800A)', code: 'ELB-800', name: '메인 차단기', price: 150000, icon: '⚡', count: 2 },
      { type: '전기', major: '마그네트', minor: 'MC-22b', code: 'MC-22', name: '마그네트', price: 25000, icon: '🧲', count: 10 },
      { type: '자동화', major: 'PLC', minor: 'XGK-CPU', code: 'XGK-CPUN', name: 'LS PLC CPU', price: 350000, icon: '🖥️', count: 1 },
      { type: '자동화', major: '센서', minor: '근접센서', code: 'PR12-4DN', name: '근접센서', price: 12000, icon: '📡', count: 20 },
    ];
    for (const item of samples) { await addDoc(collection(db, "materials"), item); }
    alert("완료!");
  }

  return (
    <div className="app-container">
      <header>
        <h1>🏭 자재 관리 시스템</h1>
        <div className="header-buttons">
          <button className="icon-btn" onClick={() => setIsFormOpen(!isFormOpen)}>
            {isFormOpen ? '닫기 ❌' : '등록 ➕'}
          </button>
          <button className="status-btn" onClick={() => setIsStatusOpen(true)}>
            현황 📊
          </button>
          <button className="excel-btn" onClick={downloadExcel}>
            엑셀 ⬇️
          </button>
           <button onClick={initSampleData} style={{background:'#999', border:'none', borderRadius:'5px', color:'white', cursor:'pointer', padding:'8px 12px'}}>샘플</button>
        </div>
      </header>

      {/* 시트 탭 */}
      <div className="sheet-tabs">
        <button className={`sheet-btn ${currentSheet === '전기' ? 'active' : ''}`} onClick={() => setCurrentSheet('전기')}>⚡ 전기</button>
        <button className={`sheet-btn ${currentSheet === '자동화' ? 'active' : ''}`} onClick={() => setCurrentSheet('자동화')}>🤖 자동화</button>
      </div>

      <div className="search-bar">
        <input type="text" placeholder="🔍 품명 또는 코드 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {isFormOpen && (
        <div className="add-form">
          <div className="form-row">
             <label>구분:</label>
             <select value={newItem.type} onChange={(e) => setNewItem({...newItem, type: e.target.value, major: '', minor: ''})}>
               <option value="전기">전기</option>
               <option value="자동화">자동화</option>
             </select>
          </div>
          <div className="form-row">
            <input list="major-options" placeholder="대분류" value={newItem.major} onChange={(e) => setNewItem({...newItem, major: e.target.value})} />
            <datalist id="major-options">{existingMajors.map(m => <option key={m} value={m} />)}</datalist>
            <input list="minor-options" placeholder="소분류" value={newItem.minor} onChange={(e) => setNewItem({...newItem, minor: e.target.value})} />
            <datalist id="minor-options">{existingMinors.map(m => <option key={m} value={m} />)}</datalist>
          </div>
          <div className="form-row">
            <input type="text" placeholder="품목코드" value={newItem.code} onChange={(e) => setNewItem({...newItem, code: e.target.value})} />
            <input type="text" placeholder="품명" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} />
          </div>
          <div className="form-row">
            <input type="number" placeholder="단가" value={newItem.price} onChange={(e) => setNewItem({...newItem, price: e.target.value})} />
            <input type="text" placeholder="이미지 URL" className="url-input" value={newItem.icon} onChange={(e) => setNewItem({...newItem, icon: e.target.value})} />
          </div>
          <button onClick={handleAdd} className="add-btn">등록하기</button>
        </div>
      )}

      {/* 대분류/소분류 탭 */}
      <nav className="category-tabs">
        {majorCategories.map(cat => (
          <button key={cat} className={`tab-btn ${currentMajor === cat ? 'active' : ''}`} onClick={() => setCurrentMajor(cat)}>{cat}</button>
        ))}
      </nav>
      {currentMajor !== '전체' && minorCategories.length > 0 && (
        <nav className="minor-tabs">
          {minorCategories.map(sub => (
            <button key={sub} className={`sub-tab-btn ${currentMinor === sub ? 'active' : ''}`} onClick={() => setCurrentMinor(sub)}>{sub}</button>
          ))}
        </nav>
      )}

      {/* [수정] 현황판 모달 (탭 추가 + 헤더/푸터 고정) */}
      {isStatusOpen && (
        <div className="modal-overlay" onClick={() => setIsStatusOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 재고 자산 현황표</h2>
              <button className="close-btn" onClick={() => setIsStatusOpen(false)}>✖</button>
            </div>
            
            {/* 현황판 내부 탭 */}
            <div className="status-tabs">
              {['전체', '전기', '자동화'].map(tab => (
                <button 
                  key={tab} 
                  className={`status-tab-btn ${statusTab === tab ? 'active' : ''}`}
                  onClick={() => setStatusTab(tab)}
                >
                  {tab} 현황
                </button>
              ))}
            </div>

            {/* 테이블 컨테이너 (스크롤 적용 영역) */}
            <div className="table-wrapper">
              <table className="status-table fixed-header">
                <thead>
                  <tr><th>구분</th><th>대분류</th><th>품명</th><th>수량</th><th>금액</th></tr>
                </thead>
                <tbody>
                  {statusData.map(item => (
                    <tr key={item.id}>
                      <td>{item.type}</td>
                      <td>{item.major}</td>
                      <td style={{textAlign:'left'}}>
                        <div style={{fontWeight:'bold'}}>{item.name}</div>
                        <div style={{fontSize:'0.75rem', color:'#888'}}>{item.minor}</div>
                      </td>
                      <td>{item.count}</td>
                      <td style={{textAlign:'right', fontWeight:'bold'}}>{formatMoney((item.price||0)*item.count)}</td>
                    </tr>
                  ))}
                  {statusData.length === 0 && (
                    <tr><td colSpan="5" style={{padding:'20px', color:'#999'}}>데이터가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 고정된 합계 바닥글 (테이블 밖으로 뺌) */}
            <div className="modal-footer">
              <div className="footer-label">{statusTab} 자산 합계</div>
              <div className="footer-value">{formatMoney(totalStatusValue)}원</div>
            </div>

          </div>
        </div>
      )}

      <main className="product-grid">
        {filteredMaterials.map(item => (
          <div key={item.id} className="product-card">
            <button className="delete-btn" onClick={() => handleDelete(item.id, item.name)}>×</button>
            <div className="product-img">
              {(item.icon.startsWith('http') || item.icon.startsWith('data:')) ? <img src={item.icon} alt={item.name} /> : item.icon}
            </div>
            <div className="product-info">
              <span className="badge">{item.major}</span>
              <span className="badge-minor">{item.minor}</span>
              <h3>{item.name}</h3>
              {item.code && <p className="code-text">{item.code}</p>}
              <p className="price-tag">{formatMoney(item.price)}원</p>
            </div>
            <div className="count-controls">
              <button className="control-btn minus" onClick={() => handleCount(item.id, item.count, -1)}>-</button>
              <span className="count-display">{item.count}</span>
              <button className="control-btn plus" onClick={() => handleCount(item.id, item.count, 1)}>+</button>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}

export default App