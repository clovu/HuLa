<template>
  <div v-bind="$attrs" class="context-menu" @contextmenu.prevent="onContextMenu">
    <slot />
    <ContextMenu
      v-if="mounted"
      ref="menuRef"
      :content="content"
      :menu="menu"
      :emoji="emoji"
      :special-menu="specialMenu"
      @select="$emit('select', $event)"
      @reply-emoji="$emit('replyEmoji', $event)" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import ContextMenu from './ContextMenu.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  content: any
  menu?: any[]
  emoji?: any[]
  specialMenu?: any[]
}>()

defineEmits<{
  select: [event: any]
  replyEmoji: [event: any]
}>()

const mounted = ref(false)
const menuRef = ref<InstanceType<typeof ContextMenu>>()
const clickX = ref(0)
const clickY = ref(0)

const onContextMenu = (e: MouseEvent) => {
  clickX.value = e.clientX
  clickY.value = e.clientY
  // Always unmount first to get a clean state (removes old listeners)
  mounted.value = false
  nextTick(() => {
    mounted.value = true
    nextTick(() => {
      const el = menuRef.value?.$el as HTMLElement | undefined
      if (el) {
        el.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: clickX.value,
            clientY: clickY.value,
            button: 2
          })
        )
      }
    })
  })
}
</script>
