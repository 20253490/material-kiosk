// src/App.jsx
import { useState, useEffect } from 'react'
import './App.css'
import { db } from './firebase'
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore'
import * as XLSX from 'xlsx'

function App() {
  const [materials, setMaterials] = useState([]);
  
  // 1. 최상위 분류 (시트 구분)
  const [currentSheet, setCurrentSheet] = useState('전기자재');
  
  // 2. 대분류 (탭 1단계)
  const [currentMajor, setCurrentMajor] = useState('전체');

  // 3. [신규] 소분류 (탭 2단계)
  const [currentMinor, setCurrentMinor] = useState('전체');
  
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newItem, setNewItem] = useState({
    type: '전기자재', major: '', minor: '', code: '', name: '', price: '', icon: ''
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

  // 대분류가 바뀌면 소분류는 '전체'로 초기화 (중요!)
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
    // 연속 입력을 위해 대분류/소분류는 남겨둠
    setNewItem({ ...newItem, name: '', code: '', price: '' }); 
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`정말 '${name}'을(를) 삭제하시겠습니까?`)) {
      await deleteDoc(doc(db, "materials", id));
    }
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheets = ['전기자재', '자동화자재'];

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

  // --- 데이터 가공 및 필터링 ---

  // 1. 현재 시트 데이터
  const sheetMaterials = materials.filter(item => item.type === currentSheet);

  // 2. 대분류 목록 추출 (중복제거)
  const majorCategories = ['전체', ...new Set(sheetMaterials.map(m => m.major))];

  // 3. [신규] 소분류 목록 추출 (현재 선택된 대분류에 속한 것만!)
  const minorCategories = currentMajor === '전체' 
    ? [] // 대분류가 전체면 소분류 탭 안보여줌 (너무 많아서)
    : ['전체', ...new Set(sheetMaterials.filter(m => m.major === currentMajor).map(m => m.minor).filter(Boolean))]; 
    // filter(Boolean)은 빈칸 제외

  // 4. 최종 리스트 필터링
  const filteredMaterials = sheetMaterials.filter(item => {
    const majorMatch = currentMajor === '전체' || item.major === currentMajor;
    const minorMatch = currentMinor === '전체' || item.minor === currentMinor; // 소분류 필터
    const searchMatch = 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (item.code && item.code.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return majorMatch && minorMatch && searchMatch;
  });

  const calculateTotalValue = () => {
    return materials.reduce((sum, item) => sum + ((item.price || 0) * item.count), 0);
  };
  const formatMoney = (num) => (num || 0).toLocaleString();

  // [신규] 등록 폼에서 쓸 '기존 목록' 추출 (자동완성용)
  // 현재 시트에 있는 모든 대분류
  const existingMajors = [...new Set(materials.filter(m => m.type === newItem.type).map(m => m.major))];
  // 현재 선택된 대분류에 있는 소분류들
  const existingMinors = [...new Set(materials.filter(m => m.type === newItem.type && m.major === newItem.major).map(m => m.minor))];


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
        </div>
      </header>

      {/* 1. 시트 탭 */}
      <div className="sheet-tabs">
        <button className={`sheet-btn ${currentSheet === '전기자재' ? 'active' : ''}`} onClick={() => setCurrentSheet('전기자재')}>⚡ 전기자재</button>
        <button className={`sheet-btn ${currentSheet === '자동화자재' ? 'active' : ''}`} onClick={() => setCurrentSheet('자동화자재')}>🤖 자동화자재</button>
      </div>

      <div className="search-bar">
        <input type="text" placeholder="🔍 품명 또는 코드 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {/* 등록 폼 (자동완성 기능 추가됨!) */}
      {isFormOpen && (
        <div className="add-form">
          <div className="form-row">
             <label>구분:</label>
             <select value={newItem.type} onChange={(e) => setNewItem({...newItem, type: e.target.value, major: '', minor: ''})}>
               <option value="전기자재">전기자재</option>
               <option value="자동화자재">자동화자재</option>
             </select>
          </div>
          
          <div className="form-row">
            {/* 대분류 자동완성 입력 */}
            <input 
              list="major-options" 
              placeholder="대분류 (선택 또는 입력)" 
              value={newItem.major} 
              onChange={(e) => setNewItem({...newItem, major: e.target.value})} 
            />
            <datalist id="major-options">
              {existingMajors.map(m => <option key={m} value={m} />)}
            </datalist>

            {/* 소분류 자동완성 입력 */}
            <input 
              list="minor-options" 
              placeholder="소분류 (선택 또는 입력)" 
              value={newItem.minor} 
              onChange={(e) => setNewItem({...newItem, minor: e.target.value})} 
            />
            <datalist id="minor-options">
              {existingMinors.map(m => <option key={m} value={m} />)}
            </datalist>
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

      {/* 2. 대분류 탭 */}
      <nav className="category-tabs">
        {majorCategories.map(cat => (
          <button 
            key={cat} 
            className={`tab-btn ${currentMajor === cat ? 'active' : ''}`}
            onClick={() => setCurrentMajor(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      {/* 3. [신규] 소분류 탭 (대분류 선택시에만 보임) */}
      {currentMajor !== '전체' && minorCategories.length > 0 && (
        <nav className="minor-tabs">
          {minorCategories.map(sub => (
            <button 
              key={sub} 
              className={`sub-tab-btn ${currentMinor === sub ? 'active' : ''}`}
              onClick={() => setCurrentMinor(sub)}
            >
              {sub}
            </button>
          ))}
        </nav>
      )}

      {/* 리스트 & 모달 (기존 동일) */}
      {isStatusOpen && (
        <div className="modal-overlay" onClick={() => setIsStatusOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 전체 재고 자산 현황</h2>
              <button className="close-btn" onClick={() => setIsStatusOpen(false)}>✖</button>
            </div>
            <div className="table-container">
              <table className="status-table">
                <thead>
                  <tr><th>구분</th><th>대분류</th><th>소분류/품명</th><th>단가</th><th>수량</th><th>금액</th></tr>
                </thead>
                <tbody>
                  {materials.map(item => (
                    <tr key={item.id}>
                      <td>{item.type}</td>
                      <td>{item.major}</td>
                      <td style={{textAlign:'left'}}>
                        <span style={{color:'#666', fontSize:'0.85rem'}}> [{item.minor}] </span>
                        <b>{item.name}</b>
                      </td>
                      <td style={{textAlign:'right'}}>{formatMoney(item.price)}</td>
                      <td>{item.count}</td>
                      <td style={{textAlign:'right', fontWeight:'bold'}}>{formatMoney((item.price||0)*item.count)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5" style={{textAlign:'right', fontWeight:'bold'}}>합계 :</td>
                    <td style={{color:'#d32f2f', fontWeight:'bold'}}>{formatMoney(calculateTotalValue())}원</td>
                  </tr>
                </tfoot>
              </table>
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