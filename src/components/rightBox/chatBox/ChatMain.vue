<template>
  <div class="flex flex-col overflow-hidden h-full relative">
    <!-- 网络状态提示 -->
    <n-flex
      v-if="networkBanner"
      align="center"
      justify="center"
      class="z-999 w-full h-40px rounded-4px text-(12px [--danger-text]) bg-[--danger-bg] flex-shrink-0">
      <svg class="size-16px">
        <use href="#cloudError"></use>
      </svg>
      {{ networkBanner.text }}
    </n-flex>

    <!-- 置顶公告 -->
    <ChatAnnouncement
      v-if="isGroup"
      :announcement="topAnnouncement"
      :is-hover="isAnnouncementHover"
      @hover-change="isAnnouncementHover = $event"
      @view-all="handleViewAnnouncement" />

    <!-- 聊天内容区 -->
    <div class="flex flex-col flex-1 min-h-0">
      <div
        id="image-chat-main"
        ref="scrollContainer"
        class="scrollbar-container"
        :class="{ 'hide-scrollbar': !showScrollbar }"
        @scroll="handleScroll"
        @click="handleChatAreaClick"
        @mouseenter="showScrollbar = true"
        @mouseleave="showScrollbar = false">
        <!-- 消息列表 -->
        <div ref="messageListRef" class="message-list min-h-full flex flex-col">
          <!-- 没有更多消息提示 -->
          <div
            v-show="chatStore.shouldShowNoMoreMessage"
            class="flex-center gap-6px h-32px flex-shrink-0 cursor-default select-none">
            <p class="text-(12px #909090)">{{ t('home.chat_main.no_more') }}</p>
          </div>
          <n-flex
            v-for="(item, index) in chatStore.chatMessageList"
            :key="item.message.id"
            vertical
            class="flex-y-center mb-12px message-item"
            :data-message-id="item.message.id"
            :data-message-index="index">
            <!-- 消息间隔时间 -->
            <span class="text-(12px #909090) select-none p-4px" v-if="item.timeBlock" @click.stop>
              {{ timeToStr(item.message.sendTime) }}
            </span>
            <!-- 消息内容容器 -->
            <div
              @mouseenter="hoverId = item.message.id"
              :class="[
                'w-full box-border',
                item.message.type === MsgEnum.RECALL ? 'min-h-22px' : 'min-h-62px',
                isGroup ? 'p-[14px_10px_14px_20px]' : 'chat-single p-[4px_10px_10px_20px]',
                { 'active-reply': activeReply === item.message.id },
                { 'bg-#90909020': isMessageHovered(item) }
              ]"
              @click="handleMessageMultiSelect(item)">
              <RenderMessage
                :message="item"
                :is-group="isGroup"
                :from-user="{ uid: item.fromUser.uid }"
                :upload-progress="item.uploadProgress"
                @jump2-reply="jumpToReplyMsg" />
            </div>
          </n-flex>
        </div>
      </div>
    </div>

    <!-- 悬浮新消息按钮 -->
    <footer
      class="float-footer-button"
      v-if="shouldShowFloatFooter && currentNewMsgCount && !isMobile()"
      :style="{ bottom: '24px', right: '50px' }">
      <div class="float-box" :class="{ max: currentNewMsgCount?.count > 99 }" @click="handleFloatButtonClick">
        <n-flex justify="space-between" align="center">
          <n-icon :color="currentNewMsgCount?.count > 99 ? '#ce304f' : '#13987f'">
            <svg>
              <use href="#double-down"></use>
            </svg>
          </n-icon>
          <span
            v-if="currentNewMsgCount?.count && currentNewMsgCount.count > 0"
            class="text-12px"
            :class="{ 'color-#ce304f': currentNewMsgCount?.count > 99 }">
            {{ t('home.chat_main.new_messages', { count: newMsgCountLabel }) }}
          </span>
        </n-flex>
      </div>
    </footer>

    <!-- 文件上传进度条 -->
    <FileUploadProgress />
  </div>

  <!-- 删除确认弹窗 -->
  <ChatConfirmModal v-model:show="modalShow" :title="tips" @confirm="handleConfirm" />

  <!-- 群昵称修改弹窗 -->
  <n-modal v-model:show="groupNicknameModalVisible" class="w-360px border-rd-8px" :mask-closable="false">
    <div class="bg-[--bg-popover] w-360px h-full p-6px box-border flex flex-col">
      <div
        v-if="isMac()"
        @click="groupNicknameModalVisible = false"
        class="mac-close z-999 size-13px shadow-inner bg-#ed6a5eff rounded-50% select-none absolute left-6px">
        <svg class="hidden size-7px color-#000 select-none absolute top-3px left-3px">
          <use href="#close"></use>
        </svg>
      </div>

      <svg
        v-if="isWindows()"
        @click="groupNicknameModalVisible = false"
        class="w-12px h-12px ml-a cursor-pointer select-none">
        <use href="#close"></use>
      </svg>
      <div class="flex flex-col gap-20px p-[22px_10px_10px_22px] select-none">
        <span class="text-(16px [--text-color]) font-500">{{ t('home.chat_main.group_nickname.title') }}</span>
        <n-input
          v-model:value="groupNicknameValue"
          :placeholder="t('home.chat_main.group_nickname.placeholder')"
          :maxlength="12"
          class="border-(1px solid #90909080)"
          :disabled="groupNicknameSubmitting"
          clearable
          @keydown.enter.prevent="handleGroupNicknameConfirm" />
        <p v-if="groupNicknameError" class="text-(12px #d03553)">{{ groupNicknameError }}</p>
        <n-flex justify="end" :size="12">
          <n-button @click="groupNicknameModalVisible = false" :disabled="groupNicknameSubmitting" secondary>
            {{ t('home.chat_main.cancel') }}
          </n-button>
          <n-button color="#13987f" :loading="groupNicknameSubmitting" @click="handleGroupNicknameConfirm">
            {{ t('home.chat_main.confirm') }}
          </n-button>
        </n-flex>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MittEnum, MsgEnum } from '@/enums'
import { chatMainInjectionKey, useChatMain } from '@/hooks/useChatMain.ts'
import { useChatAnnouncement } from '@/hooks/useChatAnnouncement.ts'
import { useChatScroll } from '@/hooks/useChatScroll.ts'
import { useMitt } from '@/hooks/useMitt.ts'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { usePopover } from '@/hooks/usePopover.ts'
import type { MessageType } from '@/services/types.ts'
import { useChatStore } from '@/stores/chat.ts'
import { useGlobalStore } from '@/stores/global'
import { useUserStore } from '@/stores/user.ts'
import { audioManager } from '@/utils/AudioManager'
import { timeToStr } from '@/utils/ComputedTime'
import { isMessageMultiSelectEnabled } from '@/utils/MessageSelect'
import { isMac, isMobile, isWindows } from '@/utils/PlatformConstants'
import ChatAnnouncement from '@/components/rightBox/chatBox/ChatAnnouncement.vue'
import ChatConfirmModal from '@/components/rightBox/chatBox/ChatConfirmModal.vue'
import FileUploadProgress from '@/components/rightBox/FileUploadProgress.vue'

const { t } = useI18n()

// ==================== Store 实例 ====================
const globalStore = useGlobalStore()
const chatStore = useChatStore()
const userStore = useUserStore()
const networkStatus = useNetworkStatus()

// ==================== ChatMain 上下文（提供给子组件） ====================
const chatMainContext = useChatMain(false, { enableGroupNicknameModal: true })
provide(chatMainInjectionKey, chatMainContext)
const {
  handleConfirm,
  tips,
  modalShow,
  selectKey,
  groupNicknameModalVisible,
  groupNicknameValue,
  groupNicknameError,
  groupNicknameSubmitting,
  handleGroupNicknameConfirm
} = chatMainContext

const { enableScroll } = usePopover(selectKey, 'image-chat-main')
provide('popoverControls', { enableScroll })

// ==================== 计算属性 ====================
const isGroup = computed<boolean>(() => chatStore.isGroup)
const userUid = computed(() => userStore.userInfo!.uid || '')
const currentNewMsgCount = computed(() => chatStore.currentNewMsgCount || null)

const networkBanner = computed(() => {
  if (!networkStatus.browserOnline.value) return { text: t('home.chat_main.network_offline') }
  if (networkStatus.isWsConnecting.value) return { text: t('home.chat_main.network_connecting') }
  if (networkStatus.wsOnline.value === false) return { text: t('home.chat_main.network_ws_offline') }
  return null
})

// ==================== 滚动管理 ====================
const {
  scrollContainerRef,
  showScrollbar,
  activeReply,
  shouldShowFloatFooter,
  newMsgCountLabel,
  scrollToBottom,
  jumpToReplyMsg,
  handleScroll,
  handleChatAreaClick,
  handleFloatButtonClick
} = useChatScroll({
  chatStore,
  globalStore,
  userUid,
  currentNewMsgCount
})

// ==================== 公告管理 ====================
const currentRoomId = computed(() => globalStore.currentSessionRoomId ?? null)

const { topAnnouncement, isAnnouncementHover, handleViewAnnouncement } = useChatAnnouncement({
  isGroup,
  currentRoomId,
  scrollToBottom,
  getScrollContainer: () => scrollContainerRef.value
})

// ==================== 消息交互 ====================
const hoverId = ref('')

/** 判断消息是否应显示多选悬停高亮 */
const isMessageHovered = (item: MessageType): boolean => {
  if (!chatStore.isMsgMultiChoose || !isMessageMultiSelectEnabled(item.message.type)) return false
  if (chatStore.msgMultiChooseMode === 'forward') return false
  return hoverId.value === item.message.id || !!item.isCheck
}

/** 多选模式下点击消息切换选中状态 */
const handleMessageMultiSelect = (item: MessageType) => {
  if (chatStore.isMsgMultiChoose && isMessageMultiSelectEnabled(item.message.type)) {
    item.isCheck = !item.isCheck
  }
}

// ==================== 事件监听 ====================

/** 会话切换：停止音频、清理公告、滚动到底部 */
const handleSessionChanged = async ({ roomId, oldRoomId }: { roomId: string; oldRoomId: string | null }) => {
  if (!roomId || roomId === oldRoomId) return
  audioManager.stopAll()
  if (!isGroup.value) {
    topAnnouncement.value = null
  }
  scrollToBottom()
}

/** 滚动到底部事件（来自外部触发） */
let scrollBottomScheduled = false
useMitt.on(MittEnum.CHAT_SCROLL_BOTTOM, () => {
  if (scrollBottomScheduled) return
  scrollBottomScheduled = true
  requestAnimationFrame(() => {
    scrollBottomScheduled = false
    if (chatStore.chatMessageList.length > 60) {
      chatStore.clearRedundantMessages(globalStore.currentSessionRoomId)
    }
    scrollToBottom()
  })
})

onMounted(() => {
  useMitt.on(MittEnum.SESSION_CHANGED, handleSessionChanged)
  scrollToBottom()
})
</script>

<style scoped lang="scss">
// 悬浮按钮样式
.float-footer-button {
  position: absolute;
  z-index: 10;
  width: fit-content;
  user-select: none;
  color: #13987f;
  cursor: pointer;
}

// 原生滚动容器样式
.scrollbar-container {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  will-change: scroll-position;
  transform: translateZ(0);

  &::-webkit-scrollbar {
    width: 6px;
    transition-property: opacity;
    transition-duration: 0.3s;
    transition-timing-function: ease;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(144, 144, 144, 0.3);
    border-radius: 3px;
    transition-property: opacity, background-color;
    transition-duration: 0.3s;
    transition-timing-function: ease;
    z-index: 999;
  }

  &::-webkit-scrollbar-thumb:hover {
    background-color: rgba(144, 144, 144, 0.5);
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &.hide-scrollbar {
    &::-webkit-scrollbar {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: transparent;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    padding-right: 0.01px;
  }
}

// 消息条目性能优化
.message-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 80px;
  contain: layout style;
  will-change: auto;
}

// 拖拽时禁用鼠标事件
:global(body.dragging-resize) .scrollbar-container {
  pointer-events: none;
}
</style>
