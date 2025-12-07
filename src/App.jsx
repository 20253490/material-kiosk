// src/App.jsx
import { useState, useEffect, useRef } from 'react'
import './App.css'
import { db } from './firebase'
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore'
import * as XLSX from 'xlsx'

function App() {
  const [materials, setMaterials] = useState([]);
  
  // 메인 화면 탭 상태
  const [currentSheet, setCurrentSheet] = useState('전기');
  const [currentMajor, setCurrentMajor] = useState('전체');
  const [currentMinor, setCurrentMinor] = useState('전체');
  const [statusTab, setStatusTab] = useState('전체');
  
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newItem, setNewItem] = useState({
    type: '전기', major: '', minor: '', code: '', name: '', price: '', icon: ''
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  
  // [신규] 업로드 로딩 상태 및 파일 인풋 참조
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

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
      type: newItem.type, major: newItem.major, minor: newItem.minor,
      code: newItem.code, name: newItem.name, price: priceValue,
      icon: iconValue, count: 0
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
        // '재고금액'은 수식이라 업로드 때는 필요 없지만 보기 좋으라고 넣음
        '재고금액': (item.price || 0) * item.count,
        '이미지': item.icon // 업로드 시 이미지 유지를 위해 추가
      }));
      if(data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    const date = new Date().toISOString().slice(0,10).replace(/-/g,"");
    XLSX.writeFile(wb, `자재현황_${date}.xlsx`);
  };

  // [신규] 엑셀 업로드 처리 함수 (핵심 로직)
const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        let successCount = 0;
        let skipCount = 0;
        
        for (const sheetName of workbook.SheetNames) {
            // 1. 시트 이름 확인 (전기/자동화 포함 여부)
            let targetType = '';
            if (sheetName.includes('전기')) targetType = '전기';
            else if (sheetName.includes('자동화')) targetType = '자동화';
            else continue; // 관련 없는 시트는 패스

            // 2. 데이터 읽기
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            for (const row of rows) {
                // 3. 필수값 체크 (품명이 없으면 건너뜀)
                if (!row['품명']) {
                  skipCount++;
                  continue;
                }

                // 4. 데이터 정제 (쉼표 제거, 공백 제거 등 안전장치 추가)
                const name = String(row['품명']).trim(); // 앞뒤 공백 제거
                const major = row['대분류'] ? String(row['대분류']).trim() : '미분류';
                const minor = row['소분류'] ? String(row['소분류']).trim() : '';
                const code = row['품목코드'] ? String(row['품목코드']).trim() : '';
                const icon = row['이미지'] || '📦';

                // [중요] 숫자에 쉼표(,)가 있어도 처리하도록 수정
                // 예: "1,000" -> "1000" -> 1000
                const parseSafeNum = (val) => {
                  if (!val) return 0;
                  const strVal = String(val).replace(/,/g, '').trim(); // 쉼표 제거
                  const parsed = parseInt(strVal);
                  return isNaN(parsed) ? 0 : parsed; // 숫자가 아니면 0
                };

                const price = parseSafeNum(row['단가']);
                const count = parseSafeNum(row['현재고']);

                // 5. DB 업데이트 또는 추가
                const existingItem = materials.find(m => m.name === name && m.type === targetType);

                if (existingItem) {
                    // 이미 있으면 -> 정보 업데이트
                    const itemRef = doc(db, "materials", existingItem.id);
                    await updateDoc(itemRef, {
                        major, minor, code, price, count, icon
                    });
                } else {
                    // 없으면 -> 신규 등록
                    await addDoc(collection(db, "materials"), {
                        type: targetType,
                        major, minor, code, name, price, count, icon
                    });
                }
                successCount++;
            }
        }
        alert(`✅ 처리 완료!\n- 성공: ${successCount}건\n- 건너뜀(품명없음): ${skipCount}건`);
        
      } catch (error) {
        console.error("업로드 에러:", error);
        alert("❌ 엑셀 읽기 실패! 파일 형식을 확인해주세요.");
      } finally {
        setIsUploading(false);
        if(fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
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
  const existingMajors = [...new Set(materials.filter(m => m.type === newItem.type).map(m => m.major))];
  const existingMinors = [...new Set(materials.filter(m => m.type === newItem.type && m.major === newItem.major).map(m => m.minor))];

  const getStatusData = () => {
    let data = materials;
    if (statusTab !== '전체') data = materials.filter(item => item.type === statusTab);
    return data;
  };
  const statusData = getStatusData();
  const totalStatusValue = statusData.reduce((sum, item) => sum + ((item.price || 0) * item.count), 0);

  return (
    <div className="app-container">
      {/* 로딩 오버레이 */}
      {isUploading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>엑셀 데이터 처리 중...</p>
        </div>
      )}

      <header>
        <h1>🏭 자재 관리 시스템</h1>
        <div className="header-buttons">
          <button className="icon-btn" onClick={() => setIsFormOpen(!isFormOpen)}>
            {isFormOpen ? '닫기 ❌' : '등록 ➕'}
          </button>
          <button className="status-btn" onClick={() => setIsStatusOpen(true)}>
            현황 📊
          </button>
          
          {/* [신규] 엑셀 업로드 버튼 */}
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            style={{display:'none'}} 
            ref={fileInputRef}
            onChange={handleExcelUpload}
          />
          <button className="upload-btn" onClick={() => fileInputRef.current.click()}>
            업로드 ⬆️
          </button>

          <button className="excel-btn" onClick={downloadExcel}>
            엑셀 ⬇️
          </button>
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

      {isStatusOpen && (
        <div className="modal-overlay" onClick={() => setIsStatusOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 재고 자산 현황표</h2>
              <button className="close-btn" onClick={() => setIsStatusOpen(false)}>✖</button>
            </div>
            <div className="status-tabs">
              {['전체', '전기', '자동화'].map(tab => (
                <button key={tab} className={`status-tab-btn ${statusTab === tab ? 'active' : ''}`} onClick={() => setStatusTab(tab)}>{tab} 현황</button>
              ))}
            </div>
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
                  {statusData.length === 0 && <tr><td colSpan="5" style={{padding:'20px', color:'#999'}}>데이터가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
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