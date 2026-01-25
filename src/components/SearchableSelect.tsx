import { useState, useRef, useEffect } from 'react'
import { ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'

export interface SearchableSelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string | number | null | undefined
  onChange: (value: string | number | null) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  searchPlaceholder?: string
  emptyMessage?: string
  getOptionLabel?: (option: SearchableSelectOption) => string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  required = false,
  disabled = false,
  className = '',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options found',
  getOptionLabel = (option) => option.label,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)

  // Filter options based on search query
  const filteredOptions = options.filter((option) => {
    if (!searchQuery.trim()) return true
    const label = getOptionLabel(option).toLowerCase()
    return label.includes(searchQuery.toLowerCase().trim())
  })

  // Get selected option (handle both string and number comparisons)
  const selectedOption = options.find((opt) => {
    // Normalize both values to strings for comparison
    const optValue = String(opt.value)
    const currentValue = value !== null && value !== undefined ? String(value) : ''
    return optValue === currentValue
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      // Focus search input when dropdown opens
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setSearchQuery('')
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const optionsList = optionsRef.current
        if (!optionsList) return

        const focusableOptions = Array.from(
          optionsList.querySelectorAll<HTMLButtonElement>(
            'button:not([disabled])',
          ),
        )
        const currentIndex = focusableOptions.findIndex((btn) =>
          btn.classList.contains('bg-indigo-50'),
        )

        let nextIndex: number
        if (event.key === 'ArrowDown') {
          nextIndex =
            currentIndex < focusableOptions.length - 1
              ? currentIndex + 1
              : 0
        } else {
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : focusableOptions.length - 1
        }

        focusableOptions[nextIndex]?.focus()
        focusableOptions[nextIndex]?.scrollIntoView({
          block: 'nearest',
        })
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const focusedOption = optionsRef.current?.querySelector<HTMLButtonElement>(
          'button:focus',
        )
        if (focusedOption) {
          focusedOption.click()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setSearchQuery('')
  }

  const baseClasses =
    'w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:cursor-not-allowed'

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`${baseClasses} flex items-center justify-between text-left ${
          !selectedOption ? 'text-slate-400' : ''
        }`}
      >
        <span className="truncate">
          {selectedOption ? getOptionLabel(selectedOption) : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && !required && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
          <ChevronDownIcon
            className={`h-4 w-4 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          {/* Search Input */}
          <div className="border-b border-slate-200 p-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div
            ref={optionsRef}
            className="max-h-60 overflow-y-auto p-1"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-sm text-slate-500">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option) => {
                // Normalize both values to strings for comparison
                const optValue = String(option.value)
                const currentValue = value !== null && value !== undefined ? String(value) : ''
                const isSelected = optValue === currentValue
                const isDisabled = option.disabled || false

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => !isDisabled && handleSelect(option.value)}
                    disabled={isDisabled}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    } ${
                      isDisabled
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer'
                    } focus:bg-indigo-50 focus:outline-none`}
                  >
                    {getOptionLabel(option)}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

