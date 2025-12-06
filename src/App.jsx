// src/App.jsx
import { useState, useEffect } from 'react'
import './App.css'
import { db } from './firebase'
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore'
import * as XLSX from 'xlsx' // 엑셀 도구 불러오기

function App() {
  const [materials, setMaterials] = useState([]);
  const [currentCategory, setCurrentCategory] = useState('전체');

  // 1. DB 실시간 연동
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

  // 2. 수량 변경
  const handleCount = async (id, currentCount, delta) => {
    if (currentCount + delta < 0) return;
    const materialRef = doc(db, "materials", id);
    await updateDoc(materialRef, { count: currentCount + delta });
  };

  // 3. 데이터 초기화
  const initData = async () => {
    const initialData = [
      { id: 'm1', category: '원두', name: '에티오피아 예가체프', count: 5, icon: '☕' },
      { id: 'm2', category: '원두', name: '콜롬비아 수프리모', count: 8, icon: '☕' },
      { id: 'm3', category: '우유/시럽', name: '서울우유 1L', count: 12, icon: '🥛' },
      { id: 'm4', category: '우유/시럽', name: '바닐라 시럽', count: 3, icon: '🍯' },
      { id: 'm5', category: '부자재', name: '14oz 아이스컵', count: 100, icon: '🥤' },
      { id: 'm6', category: '부자재', name: '종이 빨대', count: 200, icon: '📏' },
    ];
    if (confirm("데이터를 초기화 하시겠습니까?")) {
      for (const item of initialData) {
        await setDoc(doc(db, "materials", item.id), item);
      }
      alert("초기화 완료!");
    }
  };

  // 4. [NEW] 엑셀 다운로드 기능
  const downloadExcel = () => {
    // (1) 엑셀에 들어갈 데이터 다듬기 (필요 없는 icon, id는 빼고 한글 이름으로 변경)
    const excelData = materials.map(item => ({
      '분류': item.category,
      '품명': item.name,
      '현재고': item.count
    }));

    // (2) 엑셀 시트(Sheet) 만들기
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // (3) 엑셀 공책(Workbook) 만들어서 시트 끼우기
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "재고현황");

    // (4) 파일로 저장하기 (파일명: 재고현황_20250505.xlsx)
    const date = new Date().toISOString().slice(0,10).replace(/-/g,"");
    XLSX.writeFile(wb, `재고현황_${date}.xlsx`);
  };

  // 필터링
  const categories = ['전체', '원두', '우유/시럽', '부자재'];
  const filteredMaterials = currentCategory === '전체' 
    ? materials 
    : materials.filter(item => item.category === currentCategory);

  return (
    <div className="app-container">
      <header>
        <h1>📦 자재 관리 키오스크</h1>
        <div style={{display:'flex', gap:'10px'}}>
           <button 
             onClick={initData} 
             style={{backgroundColor: '#ff9800', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'}}
           >
             🔄 초기화
           </button>
           
           {/* 엑셀 버튼 연결됨! */}
           <button className="excel-btn" onClick={downloadExcel}>
            엑셀 다운로드 ⬇️
          </button>
        </div>
      </header>

      <nav className="category-tabs">
        {categories.map(cat => (
          <button 
            key={cat} 
            className={`tab-btn ${currentCategory === cat ? 'active' : ''}`}
            onClick={() => setCurrentCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      <main className="product-grid">
        {filteredMaterials.map(item => (
          <div key={item.id} className="product-card">
            <div className="product-img">{item.icon}</div>
            <div className="product-info">
              <span className="badge">{item.category}</span>
              <h3>{item.name}</h3>
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