<template>
  <component
    v-memo="[
      message.message.id,
      message.message.status,
      message.message.body?.translatedText?.text || '',
      uploadProgress,
      searchKeyword,
      historyMode
    ]"
    v-if="historyMode || !hasBubble"
    :is="componentMap[msgType]"
    :body="message.message.body"
    :message-status="message.message.status"
    :upload-progress="uploadProgress"
    :from-user-uid="fromUser?.uid"
    :message="message.message"
    :data-message-id="message.message.id"
    :is-group="isGroup"
    :on-image-click="onImageClick"
    :onVideoClick="onVideoClick"
    :search-keyword="searchKeyword"
    :history-mode="historyMode" />

  <!-- 好友或者群聊的信息 -->
  <div v-else class="flex flex-col w-full" :class="{ 'justify-end': isMe }">
    <!-- 信息时间(单聊) -->
    <div
      v-if="!isGroup"
      class="text-(12px #909090) h-12px flex select-none"
      :class="{
        'pr-48px justify-end': isMe,
        'pl-42px justify-start': !isMe
      }">
      <Transition name="fade-single">
        <span v-if="hoverMsgId === message.message.id">
          {{ formatTimestamp(message.message.sendTime, true) }}
        </span>
      </Transition>
    </div>
    <div class="flex justify-center items-center">
      <n-checkbox
        v-model:checked="message.isCheck"
        v-if="chatStore.isMsgMultiChoose && chatStore.msgMultiChooseMode !== 'forward' && !isMultiSelectDisabled"
        class="mr-3 select-none"
        :focusable="false"
        @click.stop />
      <div class="flex items-start flex-1" :class="isMe ? 'flex-row-reverse' : ''">
        <!-- 头像 -->
        <n-popover
          :ref="(el: any) => el && (infoPopoverRefs[message.message.id] = el)"
          @update:show="handlePopoverUpdate(message.message.id, $event)"
          trigger="click"
          placement="right"
          :show-arrow="false"
          style="padding: 0; background: var(--bg-info)">
          <template #trigger>
            <LazyContextMenu
              @select="$event.click(message, 'Main')"
              :content="message"
              :menu="isGroup ? optionsList : void 0"
              :special-menu="report">
              <n-avatar
                round
                :size="34"
                @click="isMobile() ? toFriendInfoPage(message.fromUser.uid) : (selectKey = message.message.id)"
                class="select-none"
                :color="isDark ? '' : '#fff'"
                :fallback-src="isDark ? '/logoL.png' : '/logoD.png'"
                :src="mainAvatarSrc"
                :class="isMe ? '' : 'mr-10px'" />
            </LazyContextMenu>
          </template>
          <!-- 用户个人信息框 -->
          <InfoPopover v-if="selectKey === message.message.id" :uid="fromUser.uid" />
        </n-popover>

        <n-flex vertical :size="6" class="color-[--text-color] flex-1" :class="isMe ? 'items-end mr-10px' : ''">
          <n-flex :size="6" align="center" :style="isMe ? 'flex-direction: row-reverse' : ''">
            <LazyContextMenu
              @select="$event.click(message, 'Main')"
              :content="message"
              :menu="isGroup ? optionsList : void 0"
              :special-menu="report">
              <n-flex
                :size="6"
                class="select-none cursor-default"
                align="center"
                v-if="isGroup"
                :style="isMe ? 'flex-direction: row-reverse' : ''">
                <!-- 用户徽章 -->
                <n-popover v-if="senderBadge?.img" trigger="hover">
                  <template #trigger>
                    <n-avatar
                      class="select-none"
                      :size="18"
                      round
                      :fallback-src="isDark ? '/logoL.png' : '/logoD.png'"
                      :src="senderBadge.img" />
                  </template>
                  <span>{{ senderBadge.describe }}</span>
                </n-popover>
                <!-- 用户名 -->
                <span
                  :class="[
                    'text-12px select-none color-#909090 inline-block align-top',
                    !isMe ? 'cursor-pointer hover:color-#13987f transition-colors' : ''
                  ]"
                  @click.stop="!isMe && isGroup && useMitt.emit(MittEnum.AT, fromUser.uid)">
                  {{ senderDisplayName }}
                </span>
                <!-- 消息归属地 -->
                <span v-if="senderLocPlace" class="text-(12px #909090)">({{ senderLocPlace }})</span>
              </n-flex>
            </LazyContextMenu>
            <!-- 群主 -->
            <div v-if="isLord" class="flex px-4px py-3px rounded-4px bg-#d5304f30 size-fit select-none">
              <span class="text-(9px #d5304f)">{{ t('home.chat_sidebar.roles.owner') }}</span>
            </div>
            <!-- 管理员 -->
            <div v-if="isAdmin" class="flex px-4px py-3px rounded-4px bg-#1a7d6b30 size-fit select-none">
              <span class="text-(9px #008080)">{{ t('home.chat_sidebar.roles.admin') }}</span>
            </div>
            <!-- 信息时间(群聊) -->
            <Transition name="fade-group">
              <span v-if="isGroup && hoverMsgId === message.message.id" class="text-(12px #909090) select-none">
                {{ formatTimestamp(message.message.sendTime, true) }}
              </span>
            </Transition>
          </n-flex>
          <!--  气泡样式  -->
          <LazyContextMenu
            v-on-long-press="[(e) => handleLongPress(e, bubbleMenu), longPressOption]"
            :content="message"
            @mousedown.right="macGuard.recordSelectionBeforeContext"
            @contextmenu="macGuard.handleContextMenuSelection"
            @mouseenter="() => (hoverMsgId = message.message.id)"
            @mouseleave="() => (hoverMsgId = '')"
            class="relative flex flex-col chat-message-max-width"
            :data-key="isMe ? `U${message.message.id}` : `Q${message.message.id}`"
            :class="[isMe ? 'items-end' : 'items-start', isMobile() ? 'w-full max-w-full' : '']"
            :style="{ '--bubble-max-width': bubbleMaxWidth }"
            @select="$event.click(message, 'Main')"
            :menu="bubbleMenu"
            :emoji="emojiList"
            :special-menu="bubbleSpecialMenu"
            @reply-emoji="handleEmojiSelect($event, message)"
            @click="handleMsgClick(message)">
            <component
              v-memo="[
                message.message.id,
                message.message.status,
                message.message.body?.translatedText?.text || '',
                uploadProgress,
                searchKeyword,
                historyMode
              ]"
              :class="[
                msgType === MsgEnum.VOICE ? 'select-none cursor-pointer' : 'select-text cursor-text',
                !isSpecial ? (isMe ? 'bubble-oneself' : 'bubble') : '',
                {
                  active: activeBubble === message.message.id && !isSpecial && msgType !== MsgEnum.VOICE && !isMobile()
                }
              ]"
              :is="componentMap[msgType]"
              :body="message.message.body"
              :message-status="message.message.status"
              :upload-progress="uploadProgress"
              :from-user-uid="fromUser?.uid"
              :message="message.message"
              :data-message-id="message.message.id"
              :is-group="isGroup"
              :on-image-click="onImageClick"
              :onVideoClick="onVideoClick"
              :search-keyword="searchKeyword"
              :history-mode="historyMode" />

            <!-- 显示翻译文本 -->
            <Transition name="fade-translate" appear mode="out-in">
              <div v-if="translatedText" class="translated-text cursor-default flex flex-col">
                <n-flex align="center" justify="space-between" class="mb-6px">
                  <n-flex align="center" :size="4">
                    <span class="text-(12px #909090)">{{ translatedText.provider }}</span>
                    <svg class="size-12px">
                      <use href="#success"></use>
                    </svg>

                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <svg
                          class="pl-6px size-10px cursor-pointer hover:color-#909090 hover:transition-colors"
                          @click="handleCopyTranslation(translatedText.text)">
                          <use href="#copy"></use>
                        </svg>
                      </template>
                      <span>复制翻译</span>
                    </n-tooltip>
                  </n-flex>
                  <svg class="size-10px cursor-pointer" @click="message.message.body.translatedText = null">
                    <use href="#close"></use>
                  </svg>
                </n-flex>
                <p class="select-text cursor-text">{{ translatedText.text }}</p>
              </div>
            </Transition>

            <!-- 消息状态指示器 -->
            <div v-if="isMe" class="absolute -left-6 top-2">
              <n-icon v-if="message.message.status === MessageStatusEnum.SENDING" class="text-gray-400">
                <img class="size-16px" src="@/assets/img/loading-one.svg" alt="" />
              </n-icon>
              <n-icon
                v-if="message.message.status === MessageStatusEnum.FAILED"
                class="text-#d5304f cursor-pointer"
                @click.stop="handleRetry(message)">
                <svg class="size-16px">
                  <use href="#cloudError"></use>
                </svg>
              </n-icon>
            </div>
          </LazyContextMenu>

          <!-- 回复的内容 -->
          <n-flex
            align="center"
            :size="6"
            v-if="replyContent"
            @click="emit('jump2Reply', replyContent.id)"
            :class="isMobile() ? 'bg-#fafafa text-13px' : 'bg-[--right-chat-reply-color] text-12px'"
            class="reply-bubble relative w-fit custom-shadow select-none chat-message-max-width"
            :style="{ 'max-width': bubbleMaxWidth }">
            <svg class="size-14px">
              <use href="#to-top"></use>
            </svg>
            <n-avatar
              class="reply-avatar"
              round
              :size="20"
              :color="isDark ? '' : '#fff'"
              :fallback-src="isDark ? '/logoL.png' : '/logoD.png'"
              :src="getReplyAvatarSrc(replyContent.uid)" />
            <span>{{ `${replyContent.username}: ` }}</span>
            <span class="content-span">
              {{ replyContent.body }}
            </span>
            <div v-if="replyContent.imgCount" class="reply-img-sub">
              {{ replyContent.imgCount }}
            </div>
          </n-flex>

          <!-- 动态渲染所有回复表情反应 -->
          <div
            v-if="activeEmojiReactions.length > 0"
            class="flex-y-center gap-6px flex-wrap w-270px"
            :class="{ 'justify-end': isSingleLineEmojis() }">
            <div class="flex-y-center" v-for="emoji in activeEmojiReactions" :key="emoji.value">
              <div
                class="emoji-reply-bubble"
                :class="{ 'emoji-reply-bubble--active': hasUserMarkedEmoji(message, emoji.value) }"
                @click.stop="cancelReplyEmoji(message, emoji.value)">
                <img :title="emoji.title" class="size-18px" :src="emoji.url" :alt="emoji.title" />
                <span :class="hasUserMarkedEmoji(message, emoji.value) ? 'text-#fbb160' : 'text-(12px #eee)'">
                  {{ getEmojiCount(message, emoji.value) }}
                </span>
              </div>
            </div>
          </div>
        </n-flex>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessageStatusEnum, MittEnum, MsgEnum, ThemeEnum } from '@/enums'
import { chatMainInjectionKey, useChatMain } from '@/hooks/useChatMain'
import { useMitt } from '@/hooks/useMitt'
import { usePopover } from '@/hooks/usePopover'
import type { MessageType } from '@/services/types'
import { useCachedStore } from '@/stores/cached'
import { useGlobalStore } from '@/stores/global'
import { useGroupStore } from '@/stores/group'
import { useSettingStore } from '@/stores/setting'
import { AvatarUtils } from '@/utils/AvatarUtils'
import { formatTimestamp } from '@/utils/ComputedTime.ts'
import { isMessageMultiSelectEnabled } from '@/utils/MessageSelect'
import { useChatStore } from '@/stores/chat'
import { useUserStore } from '@/stores/user'
import { markMsg, getUserByIds } from '@/utils/ImRequestUtils'
import { createMacContextSelectionGuard } from '@/utils/MacSelectionGuard'
import { isMobile } from '@/utils/PlatformConstants'
import Announcement from './Announcement.vue'
import AudioCall from './AudioCall.vue'
import Emoji from './Emoji.vue'
import File from './File.vue'
import Image from './Image.vue'
import Location from './Location.vue'
import MergeMessage from './MergeMessage.vue'
import BotMessage from './special/BotMessage.vue'
import RecallMessage from './special/RecallMessage.vue'
import SystemMessage from './special/SystemMessage.vue'
import Text from './Text.vue'
import Video from './Video.vue'
import VideoCall from './VideoCall.vue'
import Voice from './Voice.vue'
import { toFriendInfoPage } from '@/utils/RouterUtils'
import { vOnLongPress } from '@vueuse/components'
import LazyContextMenu from '@/components/common/LazyContextMenu.vue'

const props = withDefaults(
  defineProps<{
    message: MessageType
    uploadProgress?: number
    isGroup: boolean
    fromUser: {
      uid: string
    }
    onImageClick?: (url: string) => void
    onVideoClick?: (url: string) => void
    searchKeyword?: string
    historyMode?: boolean
  }>(),
  {
    historyMode: false
  }
)

const emit = defineEmits(['jump2Reply'])
const { t } = useI18n()
const globalStore = useGlobalStore()
const selectKey = ref(props.fromUser!.uid)
const infoPopoverRefs = reactive<Record<string, any>>({})
const { handlePopoverUpdate } = usePopover(selectKey, 'image-chat-main')

const userStore = useUserStore()
const hoverMsgId = ref<string>('')
const settingStore = useSettingStore()
const { themes } = storeToRefs(settingStore)
const injectedChatMain = inject(chatMainInjectionKey, null)
const chatMainApi = injectedChatMain ?? useChatMain()
const { optionsList, report, activeBubble, handleItemType, emojiList, specialMenuList, handleMsgClick } = chatMainApi
const groupStore = useGroupStore()
const chatStore = useChatStore()
const cachedStore = useCachedStore()
const resolvingUserSet = new Set<string>()
const macGuard = createMacContextSelectionGuard({ lockSelector: '.chat-message-max-width' })

const isMe = computed(() => props.fromUser?.uid === userStore.userInfo!.uid)
const msgType = computed(() => props.message.message.type)
const hasBubble = computed(
  () => msgType.value !== MsgEnum.RECALL && msgType.value !== MsgEnum.SYSTEM && msgType.value !== MsgEnum.BOT
)
const isSpecial = computed(() => {
  const t = msgType.value
  return (
    t === MsgEnum.IMAGE ||
    t === MsgEnum.EMOJI ||
    t === MsgEnum.NOTICE ||
    t === MsgEnum.VIDEO ||
    t === MsgEnum.FILE ||
    t === MsgEnum.MERGE ||
    t === MsgEnum.LOCATION
  )
})
const isMultiSelectDisabled = computed(() => !isMessageMultiSelectEnabled(msgType.value))
const bubbleMaxWidth = computed(() => (isMobile() ? '84%' : props.isGroup ? '32vw' : '50vw'))
const isDark = computed(() => themes.value.content === ThemeEnum.DARK)
const isLord = computed(() => groupStore.isCurrentLord(props.fromUser.uid))
const isAdmin = computed(() => groupStore.isAdmin(props.fromUser.uid))
const bubbleMenu = computed(() => handleItemType(msgType.value))
const bubbleSpecialMenu = computed(() => specialMenuList.value(msgType.value))
const replyContent = computed(() => props.message.message.body.reply)
const translatedText = computed(() => props.message.message.body.translatedText)

// Single store lookup for sender info - avoids 4+ repeated getUserInfo calls
const senderInfo = computed(() => groupStore.getUserInfo(props.fromUser.uid))

const senderDisplayName = computed(() => {
  const displayName = groupStore.getUserDisplayName(props.fromUser.uid)
  if (displayName) return displayName
  const info = senderInfo.value
  if (info?.myName || info?.name) return info.myName || info.name || ''
  return props.message.fromUser.username || '未知用户'
})

const senderLocPlace = computed(() => {
  return senderInfo.value?.locPlace || props.message.fromUser.locPlace || ''
})

const senderBadge = computed(() => {
  if (globalStore.currentSessionRoomId !== '1') return null
  const itemId = senderInfo.value?.wearingItemId
  if (!itemId) return null
  return cachedStore.badgeById(itemId)
})

// Pre-compute main avatar URL instead of returning a new function each render
const mainAvatarSrc = computed(() => {
  if (isMe.value) {
    return AvatarUtils.getAvatarUrl(userStore.userInfo!.avatar as string)
  }
  const resolvedAvatar = senderInfo.value?.avatar || props.message.fromUser.avatar
  return AvatarUtils.getAvatarUrl(resolvedAvatar as string)
})

// Reply avatar uses a plain function (only called conditionally when reply exists)
const getReplyAvatarSrc = (uid: string) => {
  const isCurrentUser = uid === userStore.userInfo?.uid
  if (isMe.value && isCurrentUser) {
    return AvatarUtils.getAvatarUrl(userStore.userInfo!.avatar as string)
  }
  const storeUser = groupStore.getUserInfo(uid)
  const resolvedAvatar = storeUser?.avatar || (uid === props.fromUser.uid ? props.message.fromUser.avatar : '')
  return AvatarUtils.getAvatarUrl(resolvedAvatar as string)
}

const ensureSenderInfo = async (uid: string) => {
  if (!uid || resolvingUserSet.has(uid)) return
  const cachedUser = groupStore.getUserInfo(uid)
  if (cachedUser?.name || cachedUser?.myName || cachedUser?.avatar) return
  const roomId = props.message?.message?.roomId
  if (!roomId) return
  resolvingUserSet.add(uid)
  try {
    const users = await getUserByIds([uid])
    const user = Array.isArray(users) ? users[0] : null
    if (user?.uid) {
      groupStore.updateUserItem(user.uid, user, roomId)
    }
  } catch (error) {
    console.error('[Message] 拉取缺失用户信息失败:', error)
  } finally {
    resolvingUserSet.delete(uid)
  }
}

watchEffect(() => {
  if (!senderDisplayName.value || senderDisplayName.value === '未知用户') {
    ensureSenderInfo(props.fromUser.uid)
  }
})

const activeEmojiReactions = computed(() => {
  const marks = props.message?.message?.messageMarks
  if (!marks) return []
  return emojiList.value.filter((emoji) => {
    const count = marks[String(emoji.value)]?.count
    return count && count > 0
  })
})

const componentMap: Partial<Record<MsgEnum, Component>> = {
  [MsgEnum.TEXT]: Text,
  [MsgEnum.IMAGE]: Image,
  [MsgEnum.EMOJI]: Emoji,
  [MsgEnum.VIDEO]: Video,
  [MsgEnum.VOICE]: Voice,
  [MsgEnum.FILE]: File,
  [MsgEnum.NOTICE]: Announcement,
  [MsgEnum.VIDEO_CALL]: VideoCall,
  [MsgEnum.AUDIO_CALL]: AudioCall,
  [MsgEnum.SYSTEM]: SystemMessage,
  [MsgEnum.RECALL]: RecallMessage,
  [MsgEnum.BOT]: BotMessage,
  [MsgEnum.MERGE]: MergeMessage,
  [MsgEnum.LOCATION]: Location
}

const isSingleLineEmojis = (): boolean => {
  return isMe.value && activeEmojiReactions.value.length <= 5
}

const cancelReplyEmoji = async (item: MessageType, type: number): Promise<void> => {
  if (!item || !item.message || !item.message.messageMarks) return
  const userMarked = item.message.messageMarks[String(type)]?.userMarked
  if (userMarked) {
    try {
      await markMsg({ msgId: item.message.id, markType: type, actType: 2 })
    } catch (error) {
      console.error('取消表情标记失败:', error)
    }
  }
}

const getEmojiCount = (item: MessageType, emojiType: number): number => {
  if (!item?.message?.messageMarks) return 0
  return item.message.messageMarks[String(emojiType)]?.count || 0
}

const hasUserMarkedEmoji = (item: MessageType, emojiType: number) => {
  if (!item?.message?.messageMarks) return false
  return item.message.messageMarks[String(emojiType)]?.userMarked
}

const handleRetry = (item: MessageType): void => {
  console.log('重试发送消息:', item)
}

const handleCopyTranslation = (text: string) => {
  if (text) {
    navigator.clipboard.writeText(text)
    window.$message.success('复制成功')
  }
}

// 解决mac右键会选中文本的问题
const closeMenu = (event: any) => {
  if (!event.target.matches('.bubble', 'bubble-oneself')) {
    activeBubble.value = ''
  }
}

const handleEmojiSelect = async (
  context: { label: string; value: number; title: string },
  item: MessageType
): Promise<void> => {
  if (!item?.message) return
  if (!item.message.messageMarks) {
    item.message.messageMarks = {}
  }
  const userMarked = item.message.messageMarks[String(context.value)]?.userMarked
  if (!userMarked) {
    try {
      await markMsg({ msgId: item.message.id, markType: context.value, actType: 1 })
    } catch (error) {
      console.error('标记表情失败:', error)
    }
  } else {
    window.$message.warning('该表情已标记')
  }
}

useMitt.on(`${MittEnum.INFO_POPOVER}-Main`, (event: any) => {
  const messageId = event.uid
  selectKey.value = messageId
  if (infoPopoverRefs[messageId]) {
    infoPopoverRefs[messageId].setShow(true)
    handlePopoverUpdate(messageId)
  }
})

onMounted(() => {
  window.addEventListener('click', closeMenu, true)
})

onUnmounted(() => {
  window.removeEventListener('click', closeMenu, true)
})

const longPressOption = computed(() => ({
  delay: 700,
  modifiers: { prevent: isMobile(), stop: isMobile() },
  reset: true,
  windowResize: true,
  windowScroll: true,
  immediate: true,
  updateTiming: 'sync'
}))

const handleLongPress = (e: PointerEvent, _menu: any) => {
  if (!isMobile()) return
  e.preventDefault()
  e.stopPropagation()
  const target = e.target as HTMLElement
  const preventClick = (event: Event) => {
    event.stopPropagation()
    event.preventDefault()
    document.removeEventListener('click', preventClick, true)
    document.removeEventListener('pointerup', preventClick, true)
  }
  document.addEventListener('click', preventClick, true)
  document.addEventListener('pointerup', preventClick, true)
  target.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: e.clientX,
      clientY: e.clientY,
      button: 2
    })
  )
  setTimeout(() => {
    document.removeEventListener('click', preventClick, true)
    document.removeEventListener('pointerup', preventClick, true)
  }, 300)
}
</script>
<style scoped lang="scss">
@use '@/styles/scss/render-message';
</style>
