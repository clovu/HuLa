import { computed, nextTick, onUnmounted, ref, useTemplateRef, watch, watchPostEffect, type ComputedRef } from 'vue'
import { useDebounceFn, useEventListener, useResizeObserver, useTimeoutFn } from '@vueuse/core'
import { ScrollIntentEnum } from '@/enums'
import { useAutoScrollGuard } from '@/hooks/useAutoScrollGuard'
import type { useChatStore } from '@/stores/chat.ts'
import type { useGlobalStore } from '@/stores/global'

/** 滚轮事件 delta 归一化常量 */
const MAX_WHEEL_DELTA = 130
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2

/** 将滚轮 delta 限制在合理范围内 */
const clampWheelDelta = (delta: number): number => {
  if (Math.abs(delta) <= MAX_WHEEL_DELTA) return delta
  return Math.sign(delta) * MAX_WHEEL_DELTA
}

/** 归一化不同 deltaMode 的滚轮事件 */
const normalizeWheelDelta = (event: WheelEvent, target: HTMLElement): number => {
  switch (event.deltaMode) {
    case DOM_DELTA_LINE:
      return event.deltaY * 16
    case DOM_DELTA_PAGE:
      return event.deltaY * target.clientHeight
    default:
      return event.deltaY
  }
}

/**
 * 聊天滚动管理 composable
 * 统一管理滚动行为：滚轮归一化、自动滚动、触顶加载更多、新消息计数、悬浮按钮等
 */
export const useChatScroll = (options: {
  chatStore: ReturnType<typeof useChatStore>
  globalStore: ReturnType<typeof useGlobalStore>
  userUid: ComputedRef<string>
  currentNewMsgCount: ComputedRef<{ count: number; isStart: boolean } | null>
}) => {
  const { chatStore, globalStore, userUid, currentNewMsgCount } = options

  // --- 模板引用 ---
  const scrollContainerRef = useTemplateRef<HTMLDivElement>('scrollContainer')
  const messageListRef = useTemplateRef<HTMLDivElement>('messageListRef')

  // --- 滚动状态 ---
  const scrollTop = ref(0)
  const isAtBottom = ref(true)
  const isLoadingMore = ref(false)
  const suppressTopLoadMore = ref(false)
  const scrollIntent = ref<ScrollIntentEnum>(ScrollIntentEnum.NONE)
  const showScrollbar = ref(true)

  // --- 消息交互状态 ---
  const activeReply = ref('')

  // --- 自动滚动保护 ---
  const { isAutoScrolling, enableAutoScroll, stopAutoScrollGuard } = useAutoScrollGuard()

  // --- 当前房间 ---
  const currentRoomId = computed(() => globalStore.currentSessionRoomId ?? null)

  // --- 悬浮按钮显示逻辑 ---
  const shouldShowFloatFooter = computed<boolean>(() => {
    const container = scrollContainerRef.value
    if (!container) return false
    if (isLoadingMore.value) return false

    const distanceFromBottom = container.scrollHeight - scrollTop.value - container.clientHeight

    // 接近底部时不显示，避免切换会话瞬时闪现
    if (distanceFromBottom <= 20) return false

    // 有新消息时优先显示
    if (currentNewMsgCount.value?.count && currentNewMsgCount.value.count > 0) return true

    // 向下滚动且距离底部较远时显示
    if (distanceFromBottom > container.clientHeight * 0.5) return true

    return false
  })

  /** 新消息计数标签 */
  const newMsgCountLabel = computed(() => {
    const count = currentNewMsgCount.value?.count
    if (!count || count <= 0) return '0'
    return count > 99 ? '99+' : String(count)
  })

  // ==================== 内部方法 ====================

  /** 短暂抑制触顶加载，避免 scrollToBottom 误触发 */
  const temporarilySuppressTopLoadMore = () => {
    suppressTopLoadMore.value = true
    setTimeout(() => {
      suppressTopLoadMore.value = false
    }, 32)
  }

  /** 根据滚动意图执行对应操作 */
  const handleScrollByIntent = (intent: ScrollIntentEnum): void => {
    if (!scrollContainerRef.value) return

    switch (intent) {
      case ScrollIntentEnum.INITIAL:
      case ScrollIntentEnum.NEW_MESSAGE:
        scrollToBottom()
        break
      case ScrollIntentEnum.LOAD_MORE:
        // 由 handleLoadMore 管理位置恢复
        break
    }
  }

  // ==================== 公开方法 ====================

  /** 滚动到底部 */
  const scrollToBottom = (): void => {
    temporarilySuppressTopLoadMore()
    const container = scrollContainerRef.value
    if (!container) return

    chatStore.clearNewMsgCount()
    isAtBottom.value = true
    enableAutoScroll(500)

    requestAnimationFrame(() => {
      if (!container) return
      container.scrollTop = container.scrollHeight
    })
  }

  /** 滚动到指定消息索引 */
  const scrollToIndex = (index: number, behavior: ScrollBehavior = 'auto'): void => {
    const container = scrollContainerRef.value
    if (!container || index < 0) return

    const messageElements = container.querySelectorAll('[data-message-index]')
    const targetElement = messageElements[index] as HTMLElement

    if (targetElement) {
      targetElement.scrollIntoView({ behavior, block: 'center', inline: 'nearest' })
    }
  }

  /** 跳转到回复的原消息，支持加载历史消息查找 */
  const jumpToReplyMsg = async (key: string): Promise<void> => {
    let messageIndex = chatStore.chatMessageList.findIndex((msg: any) => msg.message.id === String(key))

    if (messageIndex !== -1) {
      scrollToIndex(messageIndex, 'instant')
      activeReply.value = String(key)
      return
    }

    isLoadingMore.value = true
    window.$message.info('正在查找消息...')

    let foundMessage = false
    let attemptCount = 0
    const MAX_ATTEMPTS = 5

    while (!foundMessage && attemptCount < MAX_ATTEMPTS) {
      attemptCount++
      await chatStore.loadMore()
      messageIndex = chatStore.chatMessageList.findIndex((msg) => msg.message.id === key)

      if (messageIndex !== -1) {
        foundMessage = true
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    isLoadingMore.value = false

    if (foundMessage) {
      nextTick(() => {
        scrollToIndex(messageIndex, 'instant')
        activeReply.value = key
      })
    } else {
      window.$message.warning('无法找到原始消息，可能已被删除或太久远')
    }
  }

  /** 加载更多历史消息并恢复滚动位置 */
  const handleLoadMore = async (): Promise<void> => {
    if (chatStore.currentMessageOptions?.isLoading || isLoadingMore.value || chatStore.currentMessageOptions?.isLast)
      return

    const container = scrollContainerRef.value
    if (!container) return

    scrollIntent.value = ScrollIntentEnum.LOAD_MORE
    isLoadingMore.value = true

    const oldScrollHeight = container.scrollHeight
    const oldScrollTop = container.scrollTop

    try {
      await chatStore.loadMore()
      // 恢复滚动位置，保持用户在加载前的相对位置
      container.scrollTop = oldScrollTop + (container.scrollHeight - oldScrollHeight)
    } catch (error) {
      console.error('加载历史消息失败:', error)
      window.$message?.error('加载历史消息失败，请稍后重试')
    } finally {
      isLoadingMore.value = false
      scrollIntent.value = ScrollIntentEnum.NONE
    }
  }

  /** 悬浮按钮点击：消息过多时重置列表，否则直接滚动到底部 */
  const handleFloatButtonClick = async () => {
    try {
      if (chatStore.chatMessageList.length > 60) {
        await chatStore.resetAndRefreshCurrentRoomMessages()
      }
      scrollToBottom()
    } catch (error) {
      console.error('重置消息列表失败:', error)
      scrollToBottom()
    }
  }

  /** 处理滚动事件：更新状态 + 触顶加载更多 */
  const handleScroll = (event: Event) => {
    const container = event.target as HTMLElement
    if (!container) return

    const currentScrollTop = container.scrollTop
    scrollTop.value = currentScrollTop

    if (isAutoScrolling.value) {
      isAtBottom.value = true
    } else {
      const { scrollHeight, clientHeight } = container
      isAtBottom.value = scrollHeight - currentScrollTop - clientHeight <= 150
    }

    debouncedScrollOperations(container)
  }

  /** 清除回复高亮样式 */
  const handleChatAreaClick = (event: Event): void => {
    const target = event.target as Element
    const isReplyElement =
      target.closest('.reply-bubble') || target.matches('.active-reply') || target.closest('.active-reply')

    if (!isReplyElement && activeReply.value) {
      nextTick(() => {
        const activeReplyElement = document.querySelector('.active-reply') as HTMLElement
        if (activeReplyElement) {
          activeReplyElement.classList.add('reply-exit')
          useTimeoutFn(() => {
            activeReplyElement.classList.remove('reply-exit')
            activeReply.value = ''
          }, 300)
        }
      })
    }
  }

  // ==================== 事件监听 ====================

  /** 防抖的滚动操作：触顶加载 + 到底清计数 */
  const debouncedScrollOperations = useDebounceFn(async (container: HTMLElement) => {
    const distanceFromBottom = container.scrollHeight - scrollTop.value - container.clientHeight

    if (scrollTop.value < 60) {
      if (suppressTopLoadMore.value || chatStore.currentMessageOptions?.isLast) return
      await handleLoadMore()
    }

    if (distanceFromBottom <= 20) {
      chatStore.clearNewMsgCount()
    }
  }, 16)

  /** 滚轮事件处理：归一化 delta 并限制速度 */
  const handleWheel = (event: WheelEvent) => {
    const container = scrollContainerRef.value
    if (!container) return

    // 跳过触控板缩放或横向滚动
    if (event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return

    const normalizedDelta = normalizeWheelDelta(event, container)
    if (Math.abs(normalizedDelta) < 0.5) return

    event.preventDefault()
    const limitedDelta = clampWheelDelta(normalizedDelta)
    if (Math.abs(limitedDelta) < 0.5) return

    container.scrollTop += limitedDelta
  }

  // 注册滚轮事件（passive: false 以支持 preventDefault）
  const stopWheelListener = useEventListener(scrollContainerRef, 'wheel', handleWheel, { passive: false })

  // 监听消息列表大小变化，自动滚动到底部
  useResizeObserver(messageListRef, () => {
    const container = scrollContainerRef.value
    if (!container) return

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceFromBottom <= 150 || isAtBottom.value) {
      nextTick(() => scrollToBottom())
    }
  })

  // 监听房间切换，触发初始化滚动意图
  watch(
    () => [currentRoomId.value] as const,
    ([newRoomId], [oldRoomId]) => {
      if (newRoomId && newRoomId !== oldRoomId) {
        suppressTopLoadMore.value = true
        isAtBottom.value = true
        enableAutoScroll(1200)
        scrollIntent.value = ScrollIntentEnum.INITIAL
      }
    },
    { flush: 'post' }
  )

  // 执行滚动意图
  watchPostEffect(() => {
    if (scrollIntent.value === ScrollIntentEnum.NONE) return
    handleScrollByIntent(scrollIntent.value)
    scrollIntent.value = ScrollIntentEnum.NONE
  })

  // 监听消息列表变化：新消息计数与自动滚动
  watch(
    () => chatStore.chatMessageList,
    async (value, oldValue) => {
      if (value.length <= oldValue.length) return

      const latestMessage = value[value.length - 1]
      if (isLoadingMore.value) return

      const container = scrollContainerRef.value
      if (!container) return

      const isOtherUserMessage =
        latestMessage?.fromUser?.uid && String(latestMessage.fromUser.uid) !== String(userUid.value)

      if (shouldShowFloatFooter.value && isOtherUserMessage) {
        // 不在底部且是他人消息时增加计数
        const roomId = globalStore.currentSessionRoomId
        const current = chatStore.newMsgCount[roomId]
        if (!current) {
          chatStore.newMsgCount[roomId] = { count: 1, isStart: true }
        } else {
          current.count++
        }
      } else {
        await nextTick()
        scrollToBottom()
      }
    },
    { deep: false }
  )

  // 清理
  onUnmounted(() => {
    stopAutoScrollGuard()
    stopWheelListener()
  })

  return {
    // 模板引用
    scrollContainerRef,
    messageListRef,
    // 状态
    scrollTop,
    isAtBottom,
    isLoadingMore,
    showScrollbar,
    activeReply,
    scrollIntent,
    // 计算属性
    shouldShowFloatFooter,
    newMsgCountLabel,
    // 方法
    scrollToBottom,
    scrollToIndex,
    jumpToReplyMsg,
    handleScroll,
    handleChatAreaClick,
    handleLoadMore,
    handleFloatButtonClick
  }
}
