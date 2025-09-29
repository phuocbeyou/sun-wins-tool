import inquirer from 'inquirer';

// Custom renderer để ẩn dòng chọn sau khi hoàn thành prompt
const suppressFinalAnswerRenderer = {
  render() {},
  close() {},
};

export async function dragonMenu() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'mainCmd',
      message: '📋 Chọn trò chơi:',
      choices: [
        { name: '🐲  Bắt đầu săn rồng', value: 'dragon_hunt_start' },
        { name: '⭕  Cấu hình rule', value: 'setting_dragon_hunt' }, 
        new inquirer.Separator(),
        { name: '❌  Thoát', value: 'exit' },
      ],
      pageSize: 30,
    },
  ], { renderer: suppressFinalAnswerRenderer });

  return answers.mainCmd;
}
