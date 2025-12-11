// src/App.jsx
import { useState, useEffect, useRef } from 'react'
import './App.css'
import { db } from './firebase'
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, getDoc } from 'firebase/firestore'
import * as XLSX from 'xlsx'

function App() {
  const [materials, setMaterials] = useState([]); 
  const [historyLogs, setHistoryLogs] = useState([]); 
  
  // 탭 상태들
  const [currentSheet, setCurrentSheet] = useState('전기');
  const [currentMajor, setCurrentMajor] = useState('전체');
  const [currentMinor, setCurrentMinor] = useState('전체');
  const [statusTab, setStatusTab] = useState('전체');
  const [historyTab, setHistoryTab] = useState('전체');

  const [searchTerm, setSearchTerm] = useState('');
  const [newItem, setNewItem] = useState({ type: '전기', major: '', minor: '', code: '', name: '', price: '', icon: '' });
  
  // 모달 상태들
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

  // 엑셀 옵션
  const [excelOption, setExcelOption] = useState('status'); 
  const [excelYear, setExcelYear] = useState(new Date().getFullYear());
  const [excelMonth, setExcelMonth] = useState(new Date().getMonth() + 1);
  const [excelType, setExcelType] = useState('전체'); 

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // 이력 관리 상태
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyMonth, setHistoryMonth] = useState(new Date().getMonth() + 1);
  const [isHistoryEditMode, setIsHistoryEditMode] = useState(false);

  const [recordTarget, setRecordTarget] = useState(null); 
  const [recordData, setRecordData] = useState({ type: '출고', date: '', count: '', person: '', purpose: '' });

  // 모달 열릴 때 배경 스크롤 잠금
  useEffect(() => {
    if (isFormOpen || isStatusOpen || isHistoryOpen || isExcelModalOpen || isRecordOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    }
    return () => { 
      document.body.style.overflow = 'auto'; 
      document.documentElement.style.overflow = 'auto';
    };
  }, [isFormOpen, isStatusOpen, isHistoryOpen, isExcelModalOpen, isRecordOpen]);

  // DB 실시간 연동
  useEffect(() => {
    const unsubMat = onSnapshot(collection(db, "materials"), (snapshot) => {
      const newMaterials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      newMaterials.sort((a, b) => a.name.localeCompare(b.name));
      setMaterials(newMaterials);
    });
    const unsubHist = onSnapshot(collection(db, "history"), (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      newLogs.sort((a, b) => new Date(a.date) - new Date(b.date));
      setHistoryLogs(newLogs);
    });
    return () => { unsubMat(); unsubHist(); };
  }, []);

  // 탭 변경 시 필터 초기화
  useEffect(() => { 
    setCurrentMajor('전체');
    setCurrentMinor('전체');
    setSearchTerm('');
  }, [currentSheet]);

  // 대분류 변경 시 소분류 리셋
  useEffect(() => {
    setCurrentMinor('전체');
  }, [currentMajor]);

  // --- 핸들러 ---
  const openStatusModal = () => {
    setStatusTab('전체');
    setIsStatusOpen(true);
  };

  const openHistoryModal = () => {
    setHistoryTab('전체');
    setIsHistoryOpen(true);
  };

  const openRecordModal = (item) => {
    setRecordTarget(item);
    setRecordData({ type: '출고', date: new Date().toISOString().split('T')[0], count: '', person: '', purpose: '' });
    setIsRecordOpen(true);
  };

  const handleSaveRecord = async () => {
    if (!recordData.count || parseInt(recordData.count) <= 0) return alert("수량을 입력해주세요.");
    if (recordData.type === '출고' && !recordData.person) return alert("인출자를 입력해주세요.");

    const countVal = parseInt(recordData.count);
    if (recordData.type === '출고' && recordTarget.count < countVal) return alert(`재고가 부족합니다! (현재: ${recordTarget.count})`);

    await addDoc(collection(db, "history"), {
      materialId: recordTarget.id, materialType: recordTarget.type, name: recordTarget.name, code: recordTarget.code || '',
      type: recordData.type, date: recordData.date, count: countVal,
      person: recordData.type === '입고' ? '' : recordData.person, purpose: recordData.purpose, createdAt: Date.now()
    });

    const newCount = recordData.type === '입고' ? recordTarget.count + countVal : recordTarget.count - countVal;
    await updateDoc(doc(db, "materials", recordTarget.id), { count: newCount });
    alert("처리 완료");
    setIsRecordOpen(false);
  };

  const handleHistoryCountChange = async (log, newCountVal) => {
    const newCount = parseInt(newCountVal);
    if (isNaN(newCount) || newCount < 0) return;
    const diff = newCount - log.count;
    if (diff === 0) return;

    const materialRef = doc(db, "materials", log.materialId);
    const materialSnap = await getDoc(materialRef);
    if (materialSnap.exists()) {
      const currentStock = materialSnap.data().count;
      let stockChange = log.type === '입고' ? diff : -diff;
      const nextStock = currentStock + stockChange;
      if (nextStock < 0) { alert("수정 시 재고가 마이너스가 되어 불가능합니다."); return; }
      await updateDoc(materialRef, { count: nextStock });
    }
    await updateDoc(doc(db, "history", log.id), { count: newCount });
  };

  const handleUpdateHistoryText = async (logId, field, value) => {
    await updateDoc(doc(db, "history", logId), { [field]: value });
  };
  
  // [수정] 이력 삭제 시 재고도 역산하여 반영하는 함수
  const handleDeleteHistory = async (log) => {
    // 1. 진짜 지울지 물어보기
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      // 2. 현재 자재의 최신 재고량 가져오기
      const materialRef = doc(db, "materials", log.materialId);
      const materialSnap = await getDoc(materialRef);

      // 자재가 아직 DB에 남아있다면 재고 수정 진행
      if (materialSnap.exists()) {
        const currentCount = materialSnap.data().count;
        let newCount = 0;

        // 3. 입고를 지우면 -> 재고 감소 (-), 출고를 지우면 -> 재고 증가 (+)
        if (log.type === '입고') {
          newCount = currentCount - log.count;
        } else {
          newCount = currentCount + log.count;
        }

        // 재고가 마이너스가 되는지 체크 (선택 사항)
        if (newCount < 0) {
            alert("이 기록을 삭제하면 재고가 마이너스가 되어 삭제할 수 없습니다.");
            return;
        }

        // 4. 자재(Materials) DB 업데이트
        await updateDoc(materialRef, { count: newCount });
      }

      // 5. 이력(History) DB 삭제
      await deleteDoc(doc(db, "history", log.id));
      alert("삭제 및 재고 보정 완료!");

    } catch (error) {
      console.error("삭제 중 오류:", error);
      alert("오류가 발생했습니다.");
    }
  };

  const handleAdd = async () => {
    if (!newItem.major || !newItem.name) return alert("대분류와 품명은 필수입니다.");
    await addDoc(collection(db, "materials"), {
      type: newItem.type, major: newItem.major, minor: newItem.minor, code: newItem.code, name: newItem.name, 
      price: parseInt(newItem.price || 0), icon: newItem.icon.trim(), count: 0
    });
    alert(`등록 완료`);
    setNewItem({ ...newItem, name: '', code: '', price: '' }); 
  };

  const handleDelete = async (id) => {
    if (window.confirm(`삭제하시겠습니까?`)) await deleteDoc(doc(db, "materials", id));
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        let updateCount = 0; let newCount = 0;
        for (const sheetName of workbook.SheetNames) {
            let targetType = '';
            if (sheetName.includes('전기')) targetType = '전기';
            else if (sheetName.includes('자동화')) targetType = '자동화';
            else continue; 
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            for (const row of rows) {
                if (!row['품명']) continue;
                const name = String(row['품명']).trim(); 
                const existingItem = materials.find(m => m.name.trim() === name && m.type === targetType);
                const itemData = {
                    type: targetType, 
                    major: row['대분류'] || '미분류', minor: row['소분류'] || '', code: row['품목코드'] || '', 
                    name, 
                    price: row['단가'] || 0, count: row['현재고'] || 0, icon: row['이미지'] || ''
                };

                if (existingItem) {
                    await updateDoc(doc(db, "materials", existingItem.id), itemData);
                    updateCount++;
                } else {
                    await addDoc(collection(db, "materials"), itemData);
                    newCount++;
                }
            }
        }
        alert(`업로드 완료! (수정:${updateCount}, 신규:${newCount})`);
      } catch (error) { alert("업로드 실패"); } 
      finally { setIsUploading(false); if(fileInputRef.current) fileInputRef.current.value = ''; }
    };
    reader.readAsBinaryString(file);
  };

  const runExcelDownload = () => {
    const wb = XLSX.utils.book_new();

    if (excelOption === 'status') {
      ['전기', '자동화'].forEach(sheetName => {
        const data = materials.filter(m => m.type === sheetName).map(item => ({
          '대분류': item.major, '소분류': item.minor, '품목코드': item.code,
          '품명': item.name, '단가': item.price, '현재고': item.count, '재고금액': (item.price || 0) * item.count
        }));
        if(data.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName);
      });
      XLSX.writeFile(wb, `자재현황_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else {
      let targetLogs = historyLogs.filter(log => {
        const d = new Date(log.date);
        return d.getFullYear() === excelYear && (d.getMonth() + 1) === excelMonth;
      });
      if (excelType !== '전체') targetLogs = targetLogs.filter(log => log.materialType === excelType);
      
      if (targetLogs.length === 0) { alert("데이터가 없습니다."); return; }

      const logData = targetLogs.map(log => ({
        '일자': log.date, '자재구분': log.materialType, '구분': log.type,
        '품명': log.name, '코드': log.code, '수량': log.count, '인출자': log.person, '용도': log.purpose
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logData), `${excelYear}년${excelMonth}월`);
      XLSX.writeFile(wb, `입출고이력_${excelYear}_${excelMonth}_${excelType}.xlsx`);
    }
    setIsExcelModalOpen(false);
  };

  // --- 필터링 및 변수들 ---
  const sheetMaterials = materials.filter(item => item.type === currentSheet);
  const majorCategories = ['전체', ...new Set(sheetMaterials.map(m => m.major))];
  const minorCategories = currentMajor === '전체' ? [] : ['전체', ...new Set(sheetMaterials.filter(m => m.major === currentMajor).map(m => m.minor).filter(Boolean))];
  
  const filteredMaterials = sheetMaterials.filter(item => {
    const majorMatch = currentMajor === '전체' || item.major === currentMajor;
    const minorMatch = currentMinor === '전체' || item.minor === currentMinor;
    const searchMatch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || (item.code && item.code.toLowerCase().includes(searchTerm.toLowerCase()));
    return majorMatch && minorMatch && searchMatch;
  });

  const formatMoney = (num) => (num || 0).toLocaleString();
  const existingMajors = [...new Set(materials.filter(m => m.type === newItem.type).map(m => m.major))];
  const existingMinors = [...new Set(materials.filter(m => m.type === newItem.type && m.major === newItem.major).map(m => m.minor))];
  const existingPeople = [...new Set(historyLogs.map(log => log.person).filter(Boolean))];

  const statusData = statusTab === '전체' ? materials : materials.filter(item => item.type === statusTab);
  const totalStatusValue = statusData.reduce((sum, item) => sum + ((item.price || 0) * item.count), 0);

  const filteredLogs = historyLogs.filter(log => {
    const d = new Date(log.date);
    const dateMatch = d.getFullYear() === historyYear && (d.getMonth() + 1) === historyMonth;
    const tabMatch = historyTab === '전체' || log.materialType === historyTab;
    return dateMatch && tabMatch;
  });

  return (
    <div className="app-container">
      {isUploading && <div className="loading-overlay"><div className="loading-spinner"></div><p>데이터 처리 중...</p></div>}

      <header>
        {/* 이모티콘 제거 */}
        <h1>자재 관리 시스템</h1>
        <div className="header-buttons">
          {/* [수정] 버튼 클래스 복구 (색상 적용) */}
          <button className="btn-reg" onClick={() => setIsFormOpen(!isFormOpen)}>{isFormOpen ? '닫기' : '등록'}</button>
          <button className="btn-status" onClick={openStatusModal}>재고</button>
          <button className="btn-history" onClick={openHistoryModal}>이력</button>
          <input type="file" accept=".xlsx, .xls" style={{display:'none'}} ref={fileInputRef} onChange={handleExcelUpload} />
          <button className="btn-upload" onClick={() => fileInputRef.current.click()}>업로드</button>
          <button className="btn-excel" onClick={() => setIsExcelModalOpen(true)}>다운로드</button>
        </div>
      </header>

      {/* 탭 및 검색창 */}
      <div className="sheet-tabs">
        <button className={`sheet-btn ${currentSheet === '전기' ? 'active' : ''}`} onClick={() => setCurrentSheet('전기')}>전기 자재</button>
        <button className={`sheet-btn ${currentSheet === '자동화' ? 'active' : ''}`} onClick={() => setCurrentSheet('자동화')}>자동화 자재</button>
      </div>
      <div className="search-bar">
        <input type="text" placeholder="품명 또는 코드 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {/* 등록 폼 */}
      {isFormOpen && (
        <div className="add-form">
          <div className="form-row"><label>구분:</label><select value={newItem.type} onChange={(e) => setNewItem({...newItem, type: e.target.value, major: '', minor: ''})}><option value="전기">전기</option><option value="자동화">자동화</option></select></div>
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

      {/* 대/소분류 탭 */}
      <nav className="category-tabs">
        {majorCategories.map(cat => <button key={cat} className={`tab-btn ${currentMajor === cat ? 'active' : ''}`} onClick={() => setCurrentMajor(cat)}>{cat}</button>)}
      </nav>
      {currentMajor !== '전체' && minorCategories.length > 0 && (
        <nav className="minor-tabs">
          {minorCategories.map(sub => <button key={sub} className={`sub-tab-btn ${currentMinor === sub ? 'active' : ''}`} onClick={() => setCurrentMinor(sub)}>{sub}</button>)}
        </nav>
      )}

      {/* 메인 리스트 */}
      <main className="product-grid">
        {filteredMaterials.map(item => (
          <div key={item.id} className="product-card">
            <button className="delete-btn" onClick={() => handleDelete(item.id)}>×</button>
            
            {/* 품목 이미지는 유지 (없으면 박스) */}
            <div className="product-img">
              {(item.icon && (item.icon.startsWith('http') || item.icon.startsWith('data:'))) 
                ? <img src={item.icon} alt={item.name} /> 
                : item.icon || '📦'}
            </div>

            <div className="product-info">
              <div><span className="badge">{item.major}</span><span className="badge-minor">{item.minor}</span></div>
              <h3>{item.name}</h3>{item.code && <p className="code-text">{item.code}</p>}<p className="price-tag">{formatMoney(item.price)}원</p>
            </div>
            <div className="stock-action-area">
               <div className="count-display-large">재고: {item.count}</div>
               <button className="record-btn" onClick={() => openRecordModal(item)}>기록</button>
            </div>
          </div>
        ))}
      </main>

      {/* 모달: 재고 현황 */}
      {isStatusOpen && (
        <div className="modal-overlay" onClick={() => setIsStatusOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>재고 자산 현황표</h2><button className="close-btn" onClick={() => setIsStatusOpen(false)}>✖</button></div>
            <div className="status-tabs">{['전체', '전기', '자동화'].map(tab => <button key={tab} className={`status-tab-btn ${statusTab === tab ? 'active' : ''}`} onClick={() => setStatusTab(tab)}>{tab} 현황</button>)}</div>
            <div className="table-wrapper">
              <table className="status-table fixed-header">
                <thead><tr><th>구분</th><th>대분류</th><th>품명</th><th>수량</th><th>금액</th></tr></thead>
                <tbody>
                  {statusData.map(item => (
                    <tr key={item.id}>
                      <td>{item.type}</td><td>{item.major}</td>
                      <td style={{textAlign:'left'}}><div style={{fontWeight:'bold'}}>{item.name}</div><div style={{fontSize:'0.75rem', color:'#888'}}>{item.minor}</div></td>
                      <td>{item.count}</td><td style={{textAlign:'right', fontWeight:'bold'}}>{formatMoney((item.price||0)*item.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer"><div className="footer-label">{statusTab} 자산 합계</div><div className="footer-value">{formatMoney(totalStatusValue)}원</div></div>
          </div>
        </div>
      )}

      {/* 모달: 입출고 기록 입력 */}
      {isRecordOpen && recordTarget && (
        <div className="modal-overlay" onClick={() => setIsRecordOpen(false)}>
          <div className="modal-content small-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>입/출고 기록</h2><button className="close-btn" onClick={() => setIsRecordOpen(false)}>✖</button></div>
            <div className="record-form-body">
              <h3 style={{textAlign:'center', color:'#333'}}>{recordTarget.name}</h3>
              <div className="radio-group">
                <label className={`radio-btn ${recordData.type === '입고' ? 'in' : ''}`}><input type="radio" name="type" style={{display:'none'}} value="입고" checked={recordData.type === '입고'} onChange={(e) => setRecordData({...recordData, type: e.target.value})} /> 입고 (IN)</label>
                <label className={`radio-btn ${recordData.type === '출고' ? 'out' : ''}`}><input type="radio" name="type" style={{display:'none'}} value="출고" checked={recordData.type === '출고'} onChange={(e) => setRecordData({...recordData, type: e.target.value})} /> 출고 (OUT)</label>
              </div>
              <input type="date" value={recordData.date} onChange={(e) => setRecordData({...recordData, date: e.target.value})} style={{padding:'10px', border:'1px solid #ddd'}} />
              <input type="number" placeholder="수량" value={recordData.count} onChange={(e) => setRecordData({...recordData, count: e.target.value})} style={{padding:'10px', border:'1px solid #ddd'}} />
              {recordData.type === '출고' && (
                <div style={{display:'flex', gap:'5px'}}><input list="people-list" placeholder="인출자" value={recordData.person} onChange={(e) => setRecordData({...recordData, person: e.target.value})} style={{flex:1, padding:'10px', border:'1px solid #ddd'}} /><datalist id="people-list">{existingPeople.map(p => <option key={p} value={p} />)}</datalist></div>
              )}
              <input type="text" placeholder="용도/비고" value={recordData.purpose} onChange={(e) => setRecordData({...recordData, purpose: e.target.value})} style={{padding:'10px', border:'1px solid #ddd'}} />
              <button className="confirm-btn" onClick={handleSaveRecord}>확인 (저장)</button>
            </div>
          </div>
        </div>
      )}

      {/* 모달: 입출고 이력 현황 */}
      {isHistoryOpen && (
        <div className="modal-overlay" onClick={() => setIsHistoryOpen(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>월별 입출고 이력</h2>
              <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                 <select value={historyYear} onChange={(e) => setHistoryYear(parseInt(e.target.value))} style={{padding:'5px'}}>{[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}</select>
                 <select value={historyMonth} onChange={(e) => setHistoryMonth(parseInt(e.target.value))} style={{padding:'5px'}}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
                 <button className="close-btn" onClick={() => setIsHistoryOpen(false)}>✖</button>
              </div>
            </div>
            <div className="status-tabs">
                {['전체', '전기', '자동화'].map(tab => <button key={tab} className={`status-tab-btn ${historyTab === tab ? 'active' : ''}`} onClick={() => setHistoryTab(tab)}>{tab}</button>)}
            </div>
            <div style={{padding:'10px', background:'#f8f9fa', textAlign:'right'}}>
               <button onClick={() => setIsHistoryEditMode(!isHistoryEditMode)} style={{padding:'5px 10px', borderRadius:'5px', border:'none', cursor:'pointer', background: isHistoryEditMode ? '#d32f2f' : '#868e96', color:'white'}}>
                 {isHistoryEditMode ? '수정 완료' : '수정 모드'}
               </button>
            </div>
            <div className="table-wrapper">
              <table className="status-table fixed-header">
                <thead><tr><th>일자</th><th>구분</th><th>품명(코드)</th><th>수량</th><th>인출자</th><th>용도</th>{isHistoryEditMode && <th>삭제</th>}</tr></thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log.id}>
                      <td>{isHistoryEditMode ? <input type="date" value={log.date} onChange={(e) => handleUpdateHistoryText(log.id, 'date', e.target.value)} style={{width:'110px'}}/> : log.date}</td>
                      <td><span className={`badge ${log.type === '입고' ? 'in-badge' : 'out-badge'}`} style={{color: log.type==='입고'?'green':'red'}}>{log.type}</span></td>
                      <td style={{textAlign:'left'}}><b>{log.name}</b><br/><span style={{fontSize:'0.75rem', color:'#888'}}>{log.code}</span></td>
                      <td>{isHistoryEditMode ? <input type="number" defaultValue={log.count} onBlur={(e) => handleHistoryCountChange(log, e.target.value)} style={{width:'50px', textAlign:'center'}}/> : log.count}</td>
                      <td>{isHistoryEditMode ? (log.type === '출고' ? <input type="text" value={log.person} onChange={(e) => handleUpdateHistoryText(log.id, 'person', e.target.value)} style={{width:'100%'}}/> : '-') : log.person}</td>
                      <td>{isHistoryEditMode ? <input type="text" value={log.purpose} onChange={(e) => handleUpdateHistoryText(log.id, 'purpose', e.target.value)} style={{width:'100%'}}/> : log.purpose}</td>
                      
                      {/* [수정] 작아진 삭제 버튼 */}
                      {isHistoryEditMode && (
                        <td><button className="small-del-btn" onClick={() => handleDeleteHistory(log)}>삭제</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 모달 */}
      {isExcelModalOpen && (
        <div className="modal-overlay" onClick={() => setIsExcelModalOpen(false)}>
            <div className="modal-content small-modal" onClick={(e) => e.stopPropagation()} style={{height:'auto'}}>
              <div className="modal-header"><h2>엑셀 다운로드</h2><button className="close-btn" onClick={() => setIsExcelModalOpen(false)}>✖</button></div>
              <div className="record-form-body">
                <div className="excel-options">
                  <div className={`excel-option-card ${excelOption === 'status' ? 'selected' : ''}`} onClick={() => setExcelOption('status')}><div className="opt-title">자재 현황</div><div className="opt-desc">현재 재고 목록</div></div>
                  <div className={`excel-option-card ${excelOption === 'history' ? 'selected' : ''}`} onClick={() => setExcelOption('history')}><div className="opt-title">입출고 이력</div><div className="opt-desc">월별 입/출고 기록</div></div>
                </div>
                {excelOption === 'history' && (
                  <div className="date-select-area">
                    <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                      <select value={excelYear} onChange={(e) => setExcelYear(parseInt(e.target.value))} style={{padding:'8px'}}>{[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}</select>
                      <select value={excelMonth} onChange={(e) => setExcelMonth(parseInt(e.target.value))} style={{padding:'8px'}}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
                    </div>
                    <div className="sub-radio-group">
                       {['전체', '전기', '자동화'].map(type => <label key={type} style={{cursor:'pointer', fontWeight: excelType===type?'bold':'normal'}}><input type="radio" name="excelType" checked={excelType === type} onChange={() => setExcelType(type)} /> {type}</label>)}
                    </div>
                  </div>
                )}
                <button className="confirm-btn" onClick={runExcelDownload}>다운로드 시작</button>
              </div>
            </div>
        </div>
      )}

    </div>
  )
}

export default App