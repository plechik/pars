import { useState, useEffect, useMemo, useCallback } from 'react'
import initialGiftsData from './data/gifts.json'
import './App.css'

function App() {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null

  // State: Theme
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('pars_theme')
    if (saved) return saved
    if (tg?.colorScheme) return tg.colorScheme
    return 'dark'
  })

  // State: Live Gifts list (seeded from initial data for zero-delay instant render)
  const [giftsList, setGiftsList] = useState(initialGiftsData)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  // State: Selected Gift
  const [selectedGift, setSelectedGift] = useState(() => {
    const astral = initialGiftsData.find((g) => g.id === 'astralshard')
    return astral || initialGiftsData[0]
  })

  // State: Gift Selector Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // State: Inputs and options
  const [startNum, setStartNum] = useState('1')
  const [endNum, setEndNum] = useState('1 000')
  const [filterMode, setFilterMode] = useState('first') // 'continue', 'first', 'new'
  const [activeTab, setActiveTab] = useState('parser') // 'parser', 'filters', 'history', 'subscription'
  const [isParsing, setIsParsing] = useState(false)

  // Telegram User info
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (tg) {
      tg.ready?.()
      tg.expand?.()
      if (tg.initDataUnsafe?.user) {
        setUser(tg.initDataUnsafe.user)
      }
    }
  }, [tg])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('pars_theme', theme)
  }, [theme])

  // ==================== LIVE API FETCH FUNCTION ====================
  // Fetches latest collectible gifts, floor prices, counts and photos directly via API
  const fetchLiveGifts = useCallback(async () => {
    try {
      setIsUpdating(true)
      const res = await fetch('https://portal-market.com/api/collections?limit=150')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const collections = data.collections || []

      if (collections.length > 0) {
        const featuredOrder = [
          'algorithmcup',
          'artisanbrick',
          'astralshard',
          'bdaycandle',
          'berrybox',
          'bigyear',
          'blingbinky',
          'bondedring',
          'bowtie',
        ]
        const orderDict = Object.fromEntries(featuredOrder.map((s, idx) => [s, idx]))

        const updated = collections.map((c) => {
          const id = (c.short_name || c.id || '').toLowerCase()
          const floorNum = parseFloat(c.floor_price)
          const formattedPrice =
            !isNaN(floorNum) && floorNum > 0
              ? `${floorNum.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} TON`
              : '— TON'

          const countStr = c.supply
            ? `${c.supply.toLocaleString('ru-RU')} шт.`
            : `${c.listed_count || 0} в продаже`

          // Best quality dynamic photo URL from Telegram/Portal CDN, with Fragment fallback
          const imgUrl =
            c.photo_url || `https://fragment.com/file/gifts/${id}/thumb.webp`

          return {
            id,
            name: c.name,
            count: countStr,
            floorPrice: formattedPrice,
            image: imgUrl,
            rawPrice: floorNum || 0,
            listedCount: c.listed_count,
          }
        })

        // Sort: featured items first, then by floor price
        updated.sort((a, b) => {
          const orderA = orderDict[a.id] !== undefined ? orderDict[a.id] : 999
          const orderB = orderDict[b.id] !== undefined ? orderDict[b.id] : 999
          if (orderA !== orderB) return orderA - orderB
          return b.rawPrice - a.rawPrice
        })

        setGiftsList(updated)
        setLastUpdated(new Date())

        // Update currently selected gift with fresh live data
        setSelectedGift((prev) => {
          const fresh = updated.find((g) => g.id === prev.id)
          return fresh || prev
        })
      }
    } catch (err) {
      console.warn('API fetch warning, using existing data:', err)
    } finally {
      setIsUpdating(false)
    }
  }, [])

  // Auto-fetch on mount and auto-update every 30 seconds
  useEffect(() => {
    fetchLiveGifts()
    const interval = setInterval(fetchLiveGifts, 30000)
    return () => clearInterval(interval)
  }, [fetchLiveGifts])

  const toggleTheme = () => {
    tg?.HapticFeedback?.impactOccurred('light')
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const handleOpenModal = () => {
    tg?.HapticFeedback?.impactOccurred('medium')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    tg?.HapticFeedback?.impactOccurred('light')
    setIsModalOpen(false)
    setSearchQuery('')
  }

  const handleSelectGift = (gift) => {
    tg?.HapticFeedback?.selectionChanged()
    setSelectedGift(gift)
    setIsModalOpen(false)
    setSearchQuery('')
  }

  const handleStartParsing = () => {
    tg?.HapticFeedback?.notificationOccurred('success')
    setIsParsing(true)
    setTimeout(() => {
      setIsParsing(false)
    }, 2500)
  }

  // Image error fallback cascade: Portal -> Fragment CDN -> Local WebP
  const handleImageError = (e, giftId) => {
    const target = e.currentTarget
    if (!target.dataset.triedFragment) {
      target.dataset.triedFragment = 'true'
      target.src = `https://fragment.com/file/gifts/${giftId}/thumb.webp`
    } else if (!target.dataset.triedLocal) {
      target.dataset.triedLocal = 'true'
      target.src = `/gifts/${giftId}.webp`
    }
  }

  const filteredGifts = useMemo(() => {
    if (!searchQuery.trim()) return giftsList
    const query = searchQuery.toLowerCase().trim()
    return giftsList.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.floorPrice.toLowerCase().includes(query)
    )
  }, [searchQuery, giftsList])

  return (
    <div className={`app-container ${theme}`}>
      {/* HEADER */}
      <header className="app-header">
        <h1 className="header-title">Парсер</h1>
        <div className="header-right">
          {/* Theme Toggle Button */}
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label="Сменить тему"
            title={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>

          {/* User Avatar */}
          <div className="avatar-wrapper">
            <img
              src={user?.photo_url || '/avatar.png'}
              alt="Avatar"
              className="user-avatar"
              onError={(e) => {
                e.currentTarget.src = '/avatar.png'
              }}
            />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="main-scroll">
        {/* HERO GIFT CARD */}
        <section className="gift-card" onClick={handleOpenModal}>
          <div className="gift-preview-box">
            <img
              src={selectedGift.image}
              alt={selectedGift.name}
              className="gift-main-img"
              onError={(e) => handleImageError(e, selectedGift.id)}
            />
          </div>

          <div className="gift-info-row">
            <div className="gift-text-wrap">
              <h2 className="gift-name">{selectedGift.name}</h2>
              <p className="gift-meta">
                {selectedGift.count} · floor {selectedGift.floorPrice}
              </p>
            </div>
            <button
              className="change-btn"
              onClick={(e) => {
                e.stopPropagation()
                handleOpenModal()
              }}
            >
              <span>Сменить</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </section>

        {/* SECTION: НОМЕРА */}
        <section className="section-block">
          <div className="section-label">НОМЕРА</div>
          <div className="card-box">
            <div className="form-row">
              <span className="row-label">Начало</span>
              <input
                type="text"
                className="row-input"
                value={startNum}
                onChange={(e) => setStartNum(e.target.value)}
              />
            </div>
            <div className="row-divider" />
            <div className="form-row">
              <span className="row-label">Конец</span>
              <input
                type="text"
                className="row-input"
                value={endNum}
                onChange={(e) => setEndNum(e.target.value)}
              />
            </div>

            {/* Segmented Control */}
            <div className="segmented-control">
              <button
                type="button"
                className={`seg-btn ${filterMode === 'continue' ? 'active' : ''}`}
                onClick={() => {
                  tg?.HapticFeedback?.selectionChanged()
                  setFilterMode('continue')
                }}
              >
                Продолжить
              </button>
              <button
                type="button"
                className={`seg-btn ${filterMode === 'first' ? 'active' : ''}`}
                onClick={() => {
                  tg?.HapticFeedback?.selectionChanged()
                  setFilterMode('first')
                }}
              >
                Первые
              </button>
              <button
                type="button"
                className={`seg-btn ${filterMode === 'new' ? 'active' : ''}`}
                onClick={() => {
                  tg?.HapticFeedback?.selectionChanged()
                  setFilterMode('new')
                }}
              >
                Новые
              </button>
            </div>
          </div>
          <p className="section-hint">За один парсинг - до 1 000 номеров.</p>
        </section>

        {/* SECTION: МОДЕЛЬ, ФОН, УЗОР */}
        <section className="section-block">
          <div className="section-label">МОДЕЛЬ, ФОН, УЗОР</div>
          <div
            className="card-box clickable-row"
            onClick={() => {
              tg?.HapticFeedback?.impactOccurred('light')
            }}
          >
            <div className="sparkle-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path>
              </svg>
            </div>
            <div className="clickable-text">
              <div className="clickable-title">Любые</div>
              <div className="clickable-subtitle">подходит любой экземпляр</div>
            </div>
            <div className="chevron-right">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>
        </section>

        {/* PARSING ACTION BUTTON */}
        <div className="action-button-area">
          <button
            className={`main-action-btn ${isParsing ? 'loading' : ''}`}
            onClick={handleStartParsing}
            disabled={isParsing}
          >
            {isParsing ? 'Парсинг запущен...' : 'Начать парсинг'}
          </button>
          <p className="action-subtext">до 1 000 номеров за раз</p>
        </div>
      </main>

      {/* BOTTOM NAVIGATION BAR */}
      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'parser' ? 'active' : ''}`}
          onClick={() => {
            tg?.HapticFeedback?.selectionChanged()
            setActiveTab('parser')
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Парсер</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'filters' ? 'active' : ''}`}
          onClick={() => {
            tg?.HapticFeedback?.selectionChanged()
            setActiveTab('filters')
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
          <span>Фильтры</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            tg?.HapticFeedback?.selectionChanged()
            setActiveTab('history')
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>История</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'subscription' ? 'active' : ''}`}
          onClick={() => {
            tg?.HapticFeedback?.selectionChanged()
            setActiveTab('subscription')
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>Подписка</span>
        </button>
      </nav>

      {/* MODAL: GIFT SELECTION (IMAGE 2) */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div
            className="modal-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h2 className="modal-title">Подарок</h2>
                {isUpdating && <span className="modal-live-badge">Обновление...</span>}
              </div>
              <button
                className="modal-close-btn"
                onClick={handleCloseModal}
                aria-label="Закрыть"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Search Input */}
            <div className="modal-search-wrap">
              <div className="modal-search-bar">
                <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder={`Поиск по ${giftsList.length} подаркам`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchQuery && (
                  <button
                    className="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* 3-Column Gift Grid */}
            <div className="modal-gifts-grid">
              {filteredGifts.length > 0 ? (
                filteredGifts.map((gift) => {
                  const isSelected = gift.id === selectedGift.id
                  return (
                    <div
                      key={gift.id}
                      className={`grid-gift-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectGift(gift)}
                    >
                      <div className="grid-gift-photo-box">
                        <img
                          src={gift.image}
                          alt={gift.name}
                          className="grid-gift-img"
                          loading="lazy"
                          onError={(e) => handleImageError(e, gift.id)}
                        />
                      </div>
                      <div className="grid-gift-meta">
                        <div className="grid-gift-title" title={gift.name}>
                          {gift.name}
                        </div>
                        <div className="grid-gift-price">{gift.floorPrice}</div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="empty-search-notice">
                  Подарков по запросу «{searchQuery}» не найдено
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
