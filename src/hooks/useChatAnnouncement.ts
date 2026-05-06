import { nextTick, onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { info } from '@tauri-apps/plugin-log'
import { useWindow } from '@/hooks/useWindow.ts'
import { useCachedStore } from '@/stores/cached'

export type AnnouncementData = {
  content: string
  top?: boolean
}

/**
 * 群公告管理 composable
 * 负责置顶公告的加载、Tauri 事件监听和公告弹窗交互
 */
export const useChatAnnouncement = (options: {
  isGroup: ComputedRef<boolean>
  currentRoomId: ComputedRef<string | null>
  scrollToBottom: () => void
  getScrollContainer: () => HTMLElement | null
}) => {
  const { isGroup, currentRoomId, scrollToBottom, getScrollContainer } = options

  const cacheStore = useCachedStore()
  const appWindow = WebviewWindow.getCurrent()
  const { createWebviewWindow } = useWindow()

  const topAnnouncement = ref<AnnouncementData | null>(null)
  const isAnnouncementHover = ref(false)

  // Tauri 事件监听器清理函数
  let announcementUpdatedListener: (() => void) | null = null
  let announcementClearListener: (() => void) | null = null

  /** 加载置顶公告 */
  const loadTopAnnouncement = async (roomId?: string): Promise<void> => {
    const targetRoomId = roomId ?? currentRoomId.value

    if (!targetRoomId || !isGroup.value) {
      topAnnouncement.value = null
      return
    }

    try {
      const data = await cacheStore.getGroupAnnouncementList(targetRoomId, 1, 1)

      // 房间已切换，丢弃结果
      if (targetRoomId !== currentRoomId.value) return

      if (data && data.records.length > 0) {
        const topNotice = data.records.find((item: any) => item.top)
        const oldAnnouncement = topAnnouncement.value
        topAnnouncement.value = topNotice || null

        // 公告变化且当前在底部时，自动滚动以保证用户看到最新内容
        if (oldAnnouncement !== topAnnouncement.value) {
          const container = getScrollContainer()
          if (container) {
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
            if (distanceFromBottom <= 20) {
              nextTick(() => scrollToBottom())
            }
          }
        }
      } else {
        topAnnouncement.value = null
      }
    } catch (error) {
      console.error('获取置顶公告失败:', error)
      if (targetRoomId === currentRoomId.value) {
        topAnnouncement.value = null
      }
    }
  }

  /** 打开公告列表窗口 */
  const handleViewAnnouncement = (): void => {
    nextTick(async () => {
      if (!currentRoomId.value) return
      await createWebviewWindow('查看群公告', `announList/${currentRoomId.value}/1`, 420, 620)
    })
  }

  // 监听房间/群类型变化，重新加载公告
  watch(
    () => [currentRoomId.value, isGroup.value] as const,
    async ([roomId, isGroupChat], prevValue) => {
      const [prevRoomId, prevIsGroup] = prevValue ?? [undefined, undefined]
      if (!roomId || !isGroupChat) {
        topAnnouncement.value = null
        return
      }
      if (roomId === prevRoomId && prevIsGroup === isGroupChat) return

      await loadTopAnnouncement(roomId)
    },
    { immediate: true }
  )

  // 初始化 Tauri 事件监听
  onMounted(() => {
    const initListeners = async () => {
      try {
        announcementClearListener = await appWindow.listen('announcementClear', () => {
          topAnnouncement.value = null
        })

        announcementUpdatedListener = await appWindow.listen('announcementUpdated', async (event: any) => {
          info(`公告更新事件: ${event.payload}`)
          if (!event.payload) return

          const { hasAnnouncements, topAnnouncement: newTopAnnouncement } = event.payload
          if (hasAnnouncements && newTopAnnouncement) {
            if (newTopAnnouncement.top) {
              topAnnouncement.value = newTopAnnouncement
            } else if (topAnnouncement.value) {
              // 当前有置顶公告但新公告非置顶，重新加载确认
              await loadTopAnnouncement()
            }
          } else {
            topAnnouncement.value = null
          }
        })
      } catch (error) {
        console.error('Failed to initialize announcement listeners:', error)
      }
    }

    initListeners().catch(console.error)
  })

  onUnmounted(() => {
    announcementUpdatedListener?.()
    announcementClearListener?.()
  })

  return {
    topAnnouncement,
    isAnnouncementHover,
    loadTopAnnouncement,
    handleViewAnnouncement
  }
}
