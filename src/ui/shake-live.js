import inquirer from 'inquirer';

// Custom renderer để ẩn dòng chọn sau khi hoàn thành prompt
const suppressFinalAnswerRenderer = {
  render() {},
  close() {},
};

export async function shakeDiskLiveMenu() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'mainCmd',
      message: '📋 Chọn trò chơi:',
      choices: [
        { name: '🎲  Bắt đầu xóc đĩa live', value: 'shake_disk_live_start' },
        { name: '🛑  Dừng tứ xóc đĩa live', value: 'shake_disk_live_stop' },
        { name: '⚙️  Cấu hình rule', value: 'shake_disk_live_setting' },
        new inquirer.Separator(),
        { name: '❌  Thoát', value: 'exit' },
      ],
      pageSize: 30,
    },
  ], { renderer: suppressFinalAnswerRenderer });  

  return answers.mainCmd;
}
